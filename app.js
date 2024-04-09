// 引用dotenv模組
require("dotenv").config();

//引用linebot SDK
const line = require("@line/bot-sdk");

//導入express模組
const express = require("express");

// 导入openai模块
const { OpenAI } = require("openai");

//導入yahoo-finance模組
const yahooFinance = require('yahoo-finance2').default; // 引入yahoo-finance2库

// 配置 LINE 令牌和密钥
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 获取 OpenAI API 密钥
const apiKey2 = process.env.OPENAI_API_KEY;

// 创建 LINE 客户端
const client = new line.Client(config);

// 获取 OpenAI API 密钥
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// 创建 Express 应用
const app = express();

// 设置回调路由
app.post("/callback", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

//建立取得財報函數
async function fetchStockData(ticker) {
  try {
    // 使用quoteSummary获取详细的股票信息
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "financialData", "earnings", "defaultKeyStatistics"]
    });

    const result = {
      companyName: quoteSummary.price?.longName,
      currentPrice: quoteSummary.price?.regularMarketPrice,
      targetHighPrice: quoteSummary.financialData?.targetHighPrice,
      targetLowPrice: quoteSummary.financialData?.targetLowPrice,
      targetMeanPrice: quoteSummary.financialData?.targetMeanPrice,
      numberOfAnalystOpinions: quoteSummary.financialData?.numberOfAnalystOpinions,
      recommendationMean: quoteSummary.financialData?.recommendationMean,
      revenuePerShare: quoteSummary.financialData?.revenuePerShare,
      returnOnAssets: quoteSummary.financialData?.returnOnAssets,
      returnOnEquity: quoteSummary.financialData?.returnOnEquity,
      grossProfits: quoteSummary.financialData?.grossProfit,
      grossMargins: quoteSummary.financialData?.grossMargins,
      ebitdaMargins: quoteSummary.financialData?.ebitdaMargins,
      operatingMargins: quoteSummary.financialData?.operatingMargins,
    };

    // 添加可用的收益信息
    // 注意: 这个库可能不会以相同方式提供特定季度的收益信息
    if (quoteSummary.earnings?.earningsChart?.quarterly) {
      quoteSummary.earnings.earningsChart.quarterly.forEach(quarter => {
        const quarterKey = `earnings${quarter.date}`;
        result[quarterKey] = quarter.actual;
      });
    }

    // 将结果转换为字符串以便打印或返回
    const stockDataString = JSON.stringify(result, null, 2);
    console.log(`${ticker} stock data:`);
    console.log(stockDataString);

    return result; // 返回对象，如果需要字符串，则返回stockDataString
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
  }
};

//取得歷史股價函數
const fetchStockHistoryData = async (ticker) => {
  try {
    // 设置日期范围为过去两个月
    const today = new Date();
    const twoMonthsAgo = new Date(today);
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    const fromDate = twoMonthsAgo.toISOString().split('T')[0]; // 格式化为YYYY-MM-DD
    const toDate = today.toISOString().split('T')[0];

    // 使用 yahooFinance.historical 方法获取股票的历史市场数据
    const queryOptions = {
      period1: fromDate,
      period2: toDate,
      interval: "1d", // 每天的数据
    };

    const historicalData = await yahooFinance.historical(ticker, queryOptions);

    // 筛选出只有 open, high, low, close 的数据
    const simplifiedData = historicalData.map((data) => ({
      date: data.date, // 增加日期方便参考
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
    }));

    // 将数据整理成字符串
    const historicalDataString = JSON.stringify(simplifiedData, null, 2);
    console.log(`${ticker} historical data:`);
    console.log(historicalDataString);

    return simplifiedData; // 返回对象数组，如果需要字符串，则返回historicalDataString
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error);
  }
};

const function_descriptions = [
  {
    name: "Get_stock_name_and_code",
    description: "根據對話取得對應的股市名字和代碼",
    parameters: {
      type: "object",
      properties: {
        market_code: {
          type: "string",
          description: "股市代碼 ,如 2330.TW ",
        },
        market_name: {
          type: "string",
          description: "股市名字 ,如 TSMC",
        },
      },
      required: ["market_code", "market_name"],
    },
  },
];

// 定义事件处理函数
async function handleEvent(event) {
  // 如果事件类型不是消息或消息类型不是文本，则忽略
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  
  const response = await openai.createChatCompletion({
    model:"gpt-4-turbo-preview",
    messages:[
      {"role": "system", "content": "盧振興的AI助手"},
      {"role": "user", "content": event.message.text},
    ],
    functions:function_descriptions,
    function_call:"auto",
  });
  const output = response.choices[0].message;

  // 解析股票名稱和代碼
  //const stockName = JSON.parse(output.function_call.arguments).market_name;
  const stockCode = JSON.parse(output.function_call.arguments).market_code;

  //分析k線
  const targetChat = await fetchStockHistoryData(stockCode);
  const targetFinance = await fetchStockData(stockCode)

  const chatResponse = await openai.createChatCompletion({
    model:"gpt-4-turbo-preview",
    messages:[
        {role:"system",content:"K線分析師"},
        {role:"user",content:"這是過去兩個月K線資料以rsi,日均線,MACD和布林線分析,寫出分析結果以及是否適合購買,如果適合給買入點,不需要解釋技術:"+targetChat}
    ],
  })

   // 获取k線回复的文本
   const chatResponseResult = chatResponse.data.choices[0].message.content;

   const financeResponse = await openai.createChatCompletion({
    model:"gpt-4-turbo-preview",
    messages:[
        {role:"system",content:"財報分析師"},
        {role:"user",content:"根據財報為該公司寫一段總結並且進行評分,滿分10分: "+targetFinance}
    ],
  })

   const financeResponseResult = financeResponse.data.choices[0].message.content;
   
   const finalReply = chatResponseResult + "\n" +financeResponseResult;

   // 构造回复消息
   const reply = { type: "text", text: finalReply };
   
   // 使用 LINE API 发送消息
   return client.replyMessage(event.replyToken, reply);


}

// 监听端口
const port = process.env.PORT || 3000;
app.listen(port, () => {
console.log(`listening on ${port}`);
});