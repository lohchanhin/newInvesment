// 引用dotenv模組
require("dotenv").config();

//引用linebot SDK
const line = require("@line/bot-sdk");

//導入express模組
const express = require("express");

//導入openai模組
const { Configuration, OpenAIApi } = require("openai");

//導入yahoo-finance模組
const yahooFinance = require("yahoo-finance");

// 配置 LINE 令牌和密钥
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 获取 OpenAI API 密钥
const apiKey2 = process.env.OPENAI_API_KEY;

// 创建 LINE 客户端
const client = new line.Client(config);

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
const fetchStockData = async (ticker) => {
  try {
    const data = await yahooFinance.quote({
      symbol: ticker,
      modules: ["price", "summaryProfile", "financialData", "earnings"],
    });

    const result = {
      companyName: data.summaryProfile?.longName,
      currentQuarterEstimate:
        data.earnings?.earningsChart?.currentQuarterEstimate,
      earningsQ1_2023: data.earnings?.earningsChart?.quarterly?.find(
        (item) => item.date === "1Q2023"
      )?.actual,
      earningsQ4_2022: data.earnings?.earningsChart?.quarterly?.find(
        (item) => item.date === "4Q2022"
      )?.actual,
      earningsQ3_2022: data.earnings?.earningsChart?.quarterly?.find(
        (item) => item.date === "3Q2022"
      )?.actual,
      earningsQ2_2022: data.earnings?.earningsChart?.quarterly?.find(
        (item) => item.date === "2Q2022"
      )?.actual,
      currentPrice: data.financialData?.currentPrice,
      targetHighPrice: data.financialData?.targetHighPrice,
      targetLowPrice: data.financialData?.targetLowPrice,
      targetMeanPrice: data.financialData?.targetMeanPrice,
      numberOfAnalystOpinions: data.financialData?.numberOfAnalystOpinions,
      recommendationMean: data.financialData?.recommendationMean,
      revenuePerShare: data.financialData?.revenuePerShare,
      returnOnAssets: data.financialData?.returnOnAssets,
      returnOnEquity: data.financialData?.returnOnEquity,
      grossProfits: data.financialData?.grossProfits,
      grossMargins: data.financialData?.grossMargins,
      ebitdaMargins: data.financialData?.ebitdaMargins,
      operatingMargins: data.financialData?.operatingMargins,
    };

    // 將資料整理成字串
    const stockDataString = JSON.stringify(result, null, 2);

    console.log(`${ticker} stock data:`);
    console.log(stockDataString);

    return stockDataString;
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
  }
};

//取得歷史股價函數
const fetchStockHistoryData = async (ticker) => {
  try {
    // 設置日期範圍為過去兩個月
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 2);

    // 將日期轉換為 yyyy-mm-dd 格式
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    const fromDate = formatDate(oneMonthAgo);
    const toDate = formatDate(today);

    // 使用 yfinance 獲取股票的歷史市場數據
    const historicalData = await yahooFinance.historical({
      symbol: ticker,
      from: fromDate,
      to: toDate,
    });

    // 篩選出只有 open, high, low, close 的數據
    const simplifiedData = historicalData.map((data) => ({
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
    }));

    // 將資料整理成字串
    const historicalDataString = JSON.stringify(simplifiedData, null, 2);

    return historicalDataString;
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
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

  const configuration = new Configuration({ apiKey: apiKey2 });
  const openai = new OpenAIApi(configuration);
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

//   // 检查前四个字符是否是 "分析k線"
//   if (event.message.text.slice(0, 4) === "分析k線") {
//     const stockCode = event.message.text.slice(4).replace(/\s+/g, "");
//     const target = await fetchStockHistoryData(stockCode);

//     const configuration = new Configuration({ apiKey: apiKey2 });
//     const openai = new OpenAIApi(configuration);
//     const response = await openai.createChatCompletion({
//       model: "gpt-4",
//       messages: [
//         {
//           role: "system",
//           content: "K線分析師.",
//         },
//         {
//           role: "user",
//           content:
//             "這是過去兩個月K線資料以rsi,日均線,MACD和布林線分析,寫出分析結果以及是否適合購買,如果適合給買入點,不需要解釋技術: " +
//             target,
//         },
//       ],
//       //max_tokens: 2000,
//       temperature: 0.1,
//     });

//     // 获取助手回复的文本
//     const assistantReply = response.data.choices[0].message.content;
//     // 构造回复消息
//     const reply = { type: "text", text: assistantReply };

//     // 使用 LINE API 发送图片消息
//     return client.replyMessage(event.replyToken, reply);
//   } else if (event.message.text.slice(0, 4) === "分析財報") {
//     const stockCode = event.message.text.slice(4).replace(/\s+/g, "");
//     const target = await fetchStockData(stockCode);

//     const configuration = new Configuration({ apiKey: apiKey2 });
//     const openai = new OpenAIApi(configuration);
//     const response = await openai.createChatCompletion({
//       model: "gpt-4",
//       messages: [
//         {
//           role: "system",
//           content: "財報分析師.",
//         },
//         {
//           role: "user",
//           content: "根據財報為該公司寫一段總結並且進行評分,滿分10分: " + target,
//         },
//       ],
//       //max_tokens: 2000,
//       temperature: 0.2,
//     });

//     // 获取助手回复的文本
//     const assistantReply = response.data.choices[0].message.content;
//     // 构造回复消息
//     const reply = { type: "text", text: assistantReply };

//     // 使用 LINE API 发送消息
//     return client.replyMessage(event.replyToken, reply);
//   }
}

// 监听端口
const port = process.env.PORT || 3000;
app.listen(port, () => {
console.log(`listening on ${port}`);
});