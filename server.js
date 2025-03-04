import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config(); // 讀取 .env 檔案中的 API KEY

const app = express();
app.use(express.json());
app.use(cors()); // 允許跨域請求

const PORT = 3000;

// ------------------- API URL & Model 設定 -------------------
const ollamaApiUrl = "http://localhost:11434/api/generate";
const openAiApiUrl = "https://api.openai.com/v1/chat/completions";
const ollamaModel = "gemma"; // 你可以更換成其他 Ollama 模型
const openAiModel = "gpt-4o"; // 或 "gpt-4"
const openAiApiKey = process.env.OPENAI_API_KEY;

// ------------------- 狀態管理 -------------------
/**
 * 根據需求，增加多個學習階段：
 * 1. evaluate_argumentation
 * 2. argumentation_remedial
 * 3. evaluate_claim
 * 4. claim_remedial
 * 5. evaluate_evidence
 * 6. evidence_remedial
 * 7. evaluate_reasoning
 * 8. reasoning_remedial
 * 9. completed (學習完成)
 */
let learningState = "evaluate_argumentation"; // 初始狀態

const prompts = {
    evaluate_argumentation: `
        系統角色：你是一個只輸出「是」或「否」的API，你的任務是判斷老師與學生的對話中，是否「提到了或理解了論證（argumentation）」並且「知道論證是什麼」。只需生成「是」或「否」，不需要考慮如何接續對話或做進一步的引導和說明。
        請依照以下步驟進行：
        1. 閱讀學生的對話與內容。
        2. 檢查學生是否能說明或理解論證的初步定義，例如理解「論證是說服他人」或「論證是當大家意見不同時進行的討論」。
        3. 如果符合上面的描述，即可判定為「是」。
        4. 若無法判定，則判定為「否」。
        5. 最終輸出只需包含：「是」或「否」。

        **範例輸出格式（請勿包含這行說明文字）**：
        是

        **範例一**
        - 學生回答：
          「論證就是在大家意見不同時，提出自己的想法並討論，試著讓對方理解我的觀點。」
        - 預期輸出：
          是

        **範例二**
        - 學生回答：
          「我覺得論證很重要，但我還不知道到底要幹嘛。」
        - 預期輸出：
          否

        **範例三**
        - 學生回答：
          「老師說論證可以用來說服別人，我大概能理解，就是要想辦法講得讓別人同意。」
        - 預期輸出：
          是

        **範例四**
        - 學生回答：
          「論證...好像就是發表意見吧？我不確定它跟討論有什麼關係。」
        - 預期輸出：
          否

        **範例五**
        - 學生回答：
          「不知道。」
        - 預期輸出：
          否
    `,
    argumentation_remedial: `
    Instruction:
        1. 你是一位國小自然科學的教育專家，請專注於協助學生理解論證的意義與功能，並引導學生知道論證在科學論證或討論中所扮演的角色。
        2. 每一次只執行一種 Action。
        3. 每次回答以 70 字以內為主。
    
    Action:
    - 直接講述論證的定義：以簡單易懂的方式說明什麼是論證，並詢問是否需要舉例。在解說與舉例後，請學生確認自己是否明白論證的概念。
    - 使用案例協助理解：當學生無法順利理解時，透過生活化的案例幫助學生理解。在解說與舉例後，請學生確認自己是否明白論證的概念。
    - 當學生表示理解論證時，鼓勵學生：給予正向回饋，強化學生的自信心，並接續對話，引導學生思考「主張」。
    
    Example:
    ###直接講述論證的定義
    - 學生回答：「我不知道什麼是論證」
    - 預期輸出：
    論證就是在不同觀點中，提出理由和證據，嘗試說服對方並共同找答案。這樣可以理解嗎？
    
    ###使用案例協助理解
    - 學生回答：「我還是不太懂」
    - 預期輸出：
    我舉個例子！比如要決定班遊地點時，不同人提出理由討論，這就是論證。你覺得這樣解釋清楚嗎？
    
    ###當學生表示理解論證時，鼓勵學生
    - 學生回答：「我明白了」
    - 預期輸出：
    太好了！你已掌握論證的概念。那你知道什麼是主張嗎？
      `,
    evaluate_claim: `
        系統角色：你是一個只輸出「是」或「否」的API，你的任務是判斷老師與學生的對話中，是否「提到了或意識到了主張（claim）」並且「知道主張是什麼」。只需生成「是」或「否」，不需要考慮如何接續對話或做進一步的引導或說明。

        請依照以下步驟進行：
        1. 閱讀學生的對話與內容。
        2. 檢查學生是否能說明或理解主張的初步定義，例如理解「主張是自己的立場」或「主張是表達個人意見」。
        3. 如果符合上面的描述，即可判定為「是」。
        4. 若無法判定，或只停留在只知道「主張」而不知道「主張」的意義時，則判定為「否」。
        5. 最終輸出只需包含：「是」或「否」。

        **範例輸出格式（請勿包含這行說明文字）**：
        是

        **範例一**
        - 學生回答：
          「我知道在論證裡，主張就是我們想要表達的核心想法，這是最重要的觀點，還需要用證據來支撐。」
        - 預期輸出：
        是

        **範例二**
        - 學生回答：
          「在討論時，我會先提出我的意見，但是我不太確定這算不算是主張。」
        - 預期輸出：
        否

        **範例三**
        - 學生回答：
          「老師說在論證中要有主張，不然沒辦法說服別人。」
        - 預期輸出：
        否

        **範例四**
        - 學生回答：
          「主張是我想要讓別人知道或同意的立場，我要用證據來支持這個立場，才能形成完整的論證。」
        - 預期輸出：
        是
        `,
      claim_remedial:`
        Instruction:
        1. 你是一位國小自然科學的教育專家，請專注於協助學生理解「主張」的意義與功能，並引導學生知道「主張」在科學論證或討論中所扮演的角色。
        2. 每一次只執行一種 Action。
        3. 每一次回答以 70 字以內為主。
        
        Action:
        - 直接講述主張的定義：以簡單易懂的方式說明什麼是「主張」，並詢問是否需要舉例。在解說與舉例後，請學生確認自己是否明白主張的概念。
        - 使用案例協助理解：當學生無法順利理解時，透過生活化的案例幫助學生理解主張。在解說與舉例後，請學生確認自己是否明白主張的概念。
        - 當學生表示理解主張時，鼓勵學生：給予正向回饋，強化學生的自信心，並根據學生目前的理解程度，接續對話，引導學生思考「證據」。

        Example:
        ### 直接講述主張的定義
        - 學生回答：「我不知道什麼是主張」
        - 預期輸出：
        主張就是在討論中，表達自己對某件事的看法或想法。需要範例嗎？

        ### 使用案例協助理解
        - 學生回答：「我還是不太懂」
        - 預期輸出：
        舉個例子：討論午餐要吃什麼時，你提出：「吃便當比較好」，就是主張。這樣清楚嗎？

        ### 當學生表示理解主張時，鼓勵學生
        - 學生回答：「我明白了」
        - 預期輸出：
        太棒了！你已抓到主張的重點。接下來想想，提出主張後需要證據來支持自己的主張。你知道什麼是證據嗎？
      `,
      evaluate_evidence:`
        系統角色：你是一個只輸出「是」或「否」的API，你的任務是判斷老師與學生的對話中，是否「提到了或意識到了證據（evidence）」並且「知道證據是什麼」。只需生成「是」或「否」，不需要考慮如何接續對話或做進一步的引導或說明。

        請依照以下步驟進行：
        1. 閱讀學生的對話與內容。
        2. 檢查學生是否能說明或理解證據的初步定義，例如理解「證據就是可以支撐我們觀點的事實或數據」或「證據是支撐我們主張的依據」。
        3. 如果符合上面的描述，即可判定為「是」。
        4. 若無法判定，或只停留在只知道「證據」而不知道「證據」的意義時，則判定為「否」。
        5. 最終輸出只需包含：「是」或「否」。

        **範例輸出格式（請勿包含這行說明文字）**：
        是

        **範例一**
        - 學生回答：
          「我知道在論證裡，證據就是可以支撐我們觀點的事實或數據，這是非常關鍵的部分，能讓主張更有說服力。」
        - 預期輸出：
          是

        **範例二**
        - 學生回答：
          「在討論時，我會試著找到一些可以幫助說服別人的東西，但我不太確定那是不是證據。」
        - 預期輸出：
          否

        **範例三**
        - 學生回答：
          「老師說在論證中要有證據，否則沒辦法說服別人。」
        - 預期輸出：
          否

        **範例四**
        - 學生回答：
          「證據是支撐我們主張的依據，可以是實驗數據或可靠的文獻，能幫助我們有條理地證明主張。」
        - 預期輸出：
          是
      `,
      evidence_remedial:`
        Instruction:
        1. 你是一位國小自然科學的教育專家，請專注於協助學生理解「證據」的意義與功能，並引導學生知道「證據」在科學論證或討論中所扮演的角色。
        2. 每一次只執行一種 Action。
        3. 每次回答以 70 字以內為主。

        Action:
        - 直接講述講證據的定義：以簡單易懂的方式說明什麼是證據，並詢問是否需要舉例。在解說與舉例後，請學生確認自己是否明白證據的概念。
        - 使用案例協助理解：當學生無法順利理解時，透過生活化的案例幫助學生理解證據。在解說與舉例後，請學生確認自己是否明白證據的概念。
        - 當學生表示理解證據時，鼓勵學生：給予正向回饋，強化學生的自信心，並根接續對話，引導學生思考「推理」。

        Example:
        ### 直接講述講證據的定義
        - 學生回答：「我不知道什麼是證據」
        - 預期輸出：
          證據就是能支持或反駁某個觀點的事實或資料，幫助我們判斷事情真實性。這樣可以理解嗎？

        ### 使用案例協助理解
        - 學生回答：「我還是不太懂」
        - 預期輸出：
          我舉個例子！如果我們提出「吃水果有益健康」的主張，我們需要一些資訊來證明自己的主張，例如：「水果都含有豐富的維他命C、纖維等，能夠增進免疫力」，這就是證據。這樣清楚嗎？

        ### 當學生表示理解證據時，鼓勵學生
        - 學生回答：「我明白了」
        - 預期輸出：
          太棒了！你已抓到證據的重點。那你知道什麼是推理嗎？
      `,
      evaluate_reasoning:`
      系統角色：你是一個只輸出「是」或「否」的API，你的任務是判斷老師與學生的對話中，是否「提到了或意識到了推理（reasoning）」並且「知道推理是什麼」。只需生成「是」或「否」，不需要考慮如何接續對話或做進一步的引導或說明。

      請依照以下步驟進行：  
      1. 閱讀學生的對話與內容。
      2. 檢查學生是否能說明或理解推理的初步定義，例如理解「推理是根據已知的事實或資訊，去推測並得出合理結論的過程」或「推理是連結主張與證據間的橋樑」。
      3. 如果符合上面的描述，即可判定為「是」。
      4. 若無法判定，或只停留在只知道「推理」而不知道「推理」的意義時，則判定為「否」。
      5. 最終輸出只需包含：「是」或「否」。

      **範例輸出格式（請勿包含這行說明文字）**：
      是

      ### 範例一
      - 學生回答：  
        「我知道在論證裡，推理就是把我們的想法和支撐想法的資料連結起來，這是非常關鍵的部分，能讓主張更有說服力。」
      - 預期輸出：
      是

      ### 範例二
      - 學生回答：  
        「在討論時，我會試著說服別人，但不太確定怎樣才能算是推理。」
      - 預期輸出：
      否

      ### 範例三
      - 學生回答：  
        「老師說在論證中要有推理，否則沒辦法讓人信服。」
      - 預期輸出：
      否

      ### 範例四
      - 學生回答：  
        「推理是把主張和證據結合在一起的橋樑，能幫助我們有條理地說明為什麼證據能支持主張。」
      - 預期輸出：
      是

      ### 範例五
      - **老師說明**：  
        「推理是把主張和證據結合在一起的橋樑，能幫助我們有條理地說明為什麼證據能支持主張。這樣你能夠理解嗎？」
      - **學生回答**：  
        「可以。」
      - **預期輸出**：
      是
      `,
      reasoning_remedial:`
      Instruction:
      1. 你是一位國小自然科學的教育專家，請專注於協助學生理解推理的意義與功能，並引導學生知道推理在科學論證或討論中所扮演的角色。  
      2. 每一次只執行一種 Action。
      3. 每次回答以 70 字以內為主。  

      Action:
      - 直接講述推理的定義：以簡單易懂的方式說明什麼是推理，並詢問是否需要舉例。在解說與舉例後，請學生確認自己是否明白推理的概念。
      - 使用案例協助理解「推理」：當學生無法順利理解時，透過生活化的案例幫助學生理解。在解說與舉例後，請學生確認自己是否明白推理的概念。 
      - 當學生表示理解時，鼓勵學生：給予正向回饋，強化學生的自信心。  

      Example:
      ### 直接講述推理的定義
      - 學生回答 
        「我不知道什麼是推理。」
      - 預期輸出  
        推理就是把證據和主張連結起來，解釋為什麼證據能支持主張。這樣可以理解嗎？

      ### 使用案例協助理解
      - 學生回答
        「我還是不太懂推理。」
      - 預期輸出 
        我舉個例子！想像你穿光滑的鞋跑步，會容易滑倒；但鞋底有紋路時，摩擦力變大，就能抓住地面，讓你跑得更快。這就是推理！我們的主張是『鞋底有紋路能讓人跑更快』，證據是『鞋底光滑時容易滑倒，但有紋路能增加摩擦力』，推理則是『因為摩擦力增加，鞋子更穩，不容易滑，所以跑得更快』。這樣你可以理解嗎？

      ### 當學生表示理解時，鼓勵學生
      - 學生回答
        「我明白了。」
      - 預期輸出 
        太棒了！你已經明白什麼是推理了。
      `

};

// ------------------- 對話歷史（只儲存使用者輸入和最終給使用者的回覆） -------------------
let conversationHistory = [];
// 加入一個初始對話
conversationHistory.push({
  role: "assistant",
  content:
    "你好，歡迎來到論證小教室，今天我們要來學習什麼是論證，你知道什麼是論證嗎？"
});

// ------------------- 核心 API -------------------
app.post("/api/chat", async (req, res) => {
  const { message, model } = req.body;

  // 使用者回應
  conversationHistory.push({ role: "user", content: message });

  let finalResponse = "";

  try {
    // 決定此刻要用哪個「評估Prompt」來檢查
    // ---------------------------------------------------------
    // [1] Argumentation 部分
    // ---------------------------------------------------------
    if (
      learningState === "evaluate_argumentation" ||
      learningState === "argumentation_remedial"
    ) {
      // a. 先評估 "argumentation"      
      // 將每個對話的 role:content 合併成一個字串，以換行符號分隔
      let mergedContent = conversationHistory
      .map(item => `${item.role}:${item.content}`)
      .join('\n');
      // 建立新的陣列，只有一個物件，並將上面合併後的內容放到 content
      const textToBeEval = [
      {
        role: 'user',
        content: mergedContent
      }
      ];
      const evalResp = await generateResponse(
        textToBeEval,
        prompts.evaluate_argumentation,
        model
      );
      // 2. 只取「是」或「否」
      const yesNo = evalResp
        .replace(/\s/g, "")   // 把所有空白字元(含換行)都去掉
        .trim();
      console.log(yesNo);
      // b. 根據是/否決定行動
      if (yesNo.startsWith("是")) {
        // 若「是」，進入 evaluate_claim
        console.log('pass argumentation');
        learningState = "evaluate_claim";
        finalResponse = "你已經知道什麼是論證了！接下來來看看什麼是『主張』吧！";
      } else {
        // 若「否」，繼續 argumentation_remedial
        learningState = "argumentation_remedial";

        // 產生補救訊息
        const remedialResp = await generateResponse(
          conversationHistory,
          prompts.argumentation_remedial,
          model
        );
        finalResponse = remedialResp;
      }
    }
    // ---------------------------------------------------------
    // [2] Claim 部分
    // ---------------------------------------------------------
    else if (
      learningState === "evaluate_claim" ||
      learningState === "claim_remedial"
    ) {
      // a. 先評估 "claim"
      // 將每個對話的 role:content 合併成一個字串，以換行符號分隔
      const mergedContent = conversationHistory
      .map(item => `${item.role}:${item.content}`)
      .join('\n');
      // 建立新的陣列，只有一個物件，並將上面合併後的內容放到 content
      let textToBeEval = [
      {
        role: 'user',
        content: mergedContent
      }
      ];
      const evalResp = await generateResponse(
        textToBeEval,
        prompts.evaluate_claim,
        model
      );
      // 2. 只取「是」或「否」
      const yesNo = evalResp
        .replace(/\s/g, "")   // 把所有空白字元(含換行)都去掉
        .trim();

      console.log('evalClaim', yesNo)

      // b. 根據是/否決定行動
      if (yesNo.startsWith("是")) {
        // 若「是」，學習完成
        learningState = "evaluate_evidence";
        finalResponse = "你已經知道什麼是主張了！接下來來看看什麼是『證據』吧！";
      } else {
        // 若「否」，繼續 claim_remedial
        learningState = "claim_remedial";

        // 產生補救訊息
        const remedialResp = await generateResponse(
          conversationHistory,
          prompts.claim_remedial,
          model
        );
        finalResponse = remedialResp;
      }
    }
    // ============ 證據 (evidence) 流程 ============
    else if (
      learningState === "evaluate_evidence" ||
      learningState === "evidence_remedial"
    ) {
      // 將每個對話的 role:content 合併成一個字串，以換行符號分隔
      const mergedContent = conversationHistory
      .map(item => `${item.role}:${item.content}`)
      .join('\n');
      // 建立新的陣列，只有一個物件，並將上面合併後的內容放到 content
      let textToBeEval = [
      {
        role: 'user',
        content: mergedContent
      }
      ];
      const evalResp = await generateResponse(
        textToBeEval,
        prompts.evaluate_evidence,
        model
      );
      
      // 2. 只取「是」或「否」
      const yesNo = evalResp
        .replace(/\s/g, "")   // 把所有空白字元(含換行)都去掉
        .trim();
      
        console.log('evalEvidence', yesNo)

      if (yesNo === "是") {
        // 若「是」，進入 evaluate_reasoning
        learningState = "evaluate_reasoning";
        finalResponse = "很棒，你了解了證據的重要性。接下來談『推理』。";
      } else {
        // 若「否」，進行 evidence_remedial
        learningState = "evidence_remedial";
        const remedialResp = await generateResponse(
          conversationHistory,
          prompts.evidence_remedial,
          model
        );
        finalResponse = remedialResp;
      }
    }
    // ============ 推理 (reasoning) 流程 ============
    else if (
      learningState === "evaluate_reasoning" ||
      learningState === "reasoning_remedial"
    ) {
      // 將每個對話的 role:content 合併成一個字串，以換行符號分隔
      const mergedContent = conversationHistory
      .map(item => `${item.role}:${item.content}`)
      .join('\n');
      // 建立新的陣列，只有一個物件，並將上面合併後的內容放到 content
      let textToBeEval = [
      {
        role: 'user',
        content: mergedContent
      }
      ];
      const evalResp = await generateResponse(
        textToBeEval,
        prompts.evaluate_reasoning,
        model
      );
      // 2. 只取「是」或「否」
      const yesNo = evalResp
        .replace(/\s/g, "")   // 把所有空白字元(含換行)都去掉
        .trim();
      console.log('evalReasoning', yesNo)
      

      if (yesNo === "是") {
        // 若「是」，完成學習
        learningState = "completed";
        finalResponse = "恭喜！你已經掌握了推理，也完成所有學習了！";
      } else {
        // 若「否」，進行 reasoning_remedial
        learningState = "reasoning_remedial";
        const remedialResp = await generateResponse(
          conversationHistory,
          prompts.reasoning_remedial,
          model
        );
        finalResponse = remedialResp;
      }
    }
    // ============ 完成 (completed) ============
    else if (learningState === "completed") {
      finalResponse = "你已經完成所有階段的學習，恭喜你！";
    }

    // 將最終回覆記錄入歷史
    conversationHistory.push({ role: "assistant", content: finalResponse });

    console.log("final reply:", finalResponse, learningState);
    // 回傳
    res.json({ response: finalResponse, nextState: learningState });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// 封裝：根據對話和 prompt 呼叫對應的模型
async function generateResponse(conversation, prompt, model) {
    if (model === "chatgpt") {
      return queryOpenAI(conversation, prompt);
    } else {
      return queryOllama(conversation, prompt);
    }
  }
  
// ------------------- 呼叫 OpenAI API -------------------
async function queryOpenAI(conversation, prompt) {
    const response = await fetch(openAiApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: openAiModel,
        messages: [
          { role: "system", content: prompt },
          ...conversation
        ],
        temperature: 0.7
      })
    });
    console.log("query LLM", prompt.slice(0, 100), conversation);
    const data = await response.json();
    console.log("query reply:", data.choices[0].message.content , "learning state", learningState);
    return data.choices[0].message.content;
  }

// 呼叫 Ollama API
async function queryOllama() {
    const formattedPrompt = conversationHistory.map(msg => 
        `${msg.role === "system" ? "System" : msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
    ).join("\n") + "\nAssistant:";

    const response = await fetch(ollamaApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ollamaModel, prompt: formattedPrompt, stream: false })
    });

    const data = await response.json();
    return data.response;
}

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});