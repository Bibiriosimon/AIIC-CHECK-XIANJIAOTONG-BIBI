const DEEPSEEK_API_KEY = "sk-4120e865556243daab04300f2fb50bf4"; 
const MOONSHOT_API_KEY = "sk-2yCCvWHsbiyeVU76Iilj8cjMv4weELNbCYc6w732wQt7EgXu"; 

const aiConfigs = {
    deepseek: {
        apiKey: DEEPSEEK_API_KEY,
        apiURL: "https://api.deepseek.com/chat/completions",
        modelName: "deepseek-chat" 
    },
    moonshot: {
        apiKey: MOONSHOT_API_KEY,
        apiURL: "https://api.moonshot.cn/v1/chat/completions",
        modelName: "moonshot-v1-8k"
    }
};

let userSettings = {};

// ===================================
//  DOM 元素引用 (这部分保持不变)
// ===================================
const setupContainer = document.getElementById('setup-container');
const uploadContainer = document.getElementById('upload-container');
const resultsContainer = document.getElementById('results-container');
const setupForm = document.getElementById('setup-form');
const modelSelect = document.getElementById('model-select');
const chapterSelect = document.getElementById('chapter-select');
const scoreScale = document.getElementById('score-scale');
const feedbackSelect = document.getElementById('feedback-select');
const fileDropZone = document.getElementById('file-drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const nextToUploadBtn = document.getElementById('next-to-upload-btn');
const backToSetupBtn = document.getElementById('back-to-setup-btn');
const startAnalysisBtn = document.getElementById('start-analysis-btn');
const restartBtn = document.getElementById('restart-btn');
const loadingState = document.getElementById('loading-state');
const loadingStatus = document.getElementById('loading-status');
const finalResults = document.getElementById('final-results');
const resultsList = document.getElementById('results-list');

// ===================================
//  初始化 pdf.js (这部分保持不变)
// ===================================
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
}

// ===================================
//  事件监听器 (这部分保持不变)
// ===================================
nextToUploadBtn.addEventListener('click', () => {
    userSettings = {
        mode: modelSelect.value,
        chapter: chapterSelect.value,
        score: scoreScale.value,
        feedback: feedbackSelect.value
    };
    showView(uploadContainer);
});
backToSetupBtn.addEventListener('click', () => showView(setupContainer));
fileDropZone.addEventListener('click', () => fileInput.click());
fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.classList.add('dragging'); });
fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('dragging'));
fileDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('dragging');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        updateFileListUI();
    }
});
fileInput.addEventListener('change', updateFileListUI);
startAnalysisBtn.addEventListener('click', handleAnalysis);
restartBtn.addEventListener('click', () => {
    fileInput.value = '';
    userSettings = {};
    setupForm.reset();
    updateFileListUI();
    showView(setupContainer);
});

// ===================================
//  视图和UI更新函数 (这部分保持不变)
// ===================================
function showView(view) {
    setupContainer.style.display = 'none';
    uploadContainer.style.display = 'none';
    resultsContainer.style.display = 'none';
    view.style.display = 'block';
}

function updateFileListUI() {
    fileList.innerHTML = '';
    const files = fileInput.files;
    if (files.length > 0) {
        for (const file of files) {
            const li = document.createElement('li');
            li.textContent = `${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            fileList.appendChild(li);
        }
        startAnalysisBtn.disabled = false;
        fileDropZone.querySelector('p').textContent = `已选择 ${files.length} 个文件。`;
    } else {
        startAnalysisBtn.disabled = true;
        fileDropZone.querySelector('p').textContent = '拖拽文件到此处或 📂 点击选择';
    }
}

function updateLoadingStatus(message) { loadingStatus.textContent = message; }

function createResultCard(fileName) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
        <h3>${fileName}</h3>
        <div class="result-content">
             <!-- 内容将在这里动态生成 -->
        </div>
    `;
    return card;
}

// ===================================
//  核心逻辑
// ===================================
async function handleAnalysis() {
    const files = fileInput.files;
    if (files.length === 0) return;

    showView(resultsContainer);
    loadingState.style.display = 'block';
    finalResults.style.display = 'none';
    resultsList.innerHTML = '';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const resultCard = createResultCard(file.name);
        resultsList.appendChild(resultCard);
        await analyzePDF(file, resultCard);
    }

    updateLoadingStatus("所有文件分析完成！");
    loadingState.style.display = 'none';
    finalResults.style.display = 'block';
}

async function analyzePDF(file, resultCard) {
    try {
        updateLoadingStatus(`[${file.name}] 步骤 1/4: OCR识别中...`);
        const ocrText = await extractTextViaOCR(file, (p) => updateLoadingStatus(`[${file.name}] OCR: ${p.status} (${Math.round(p.progress * 100)}%)`));
        if (!ocrText.trim()) throw new Error("OCR未能识别出任何文本。");

        updateLoadingStatus(`[${file.name}] 步骤 2/4: AI预处理器校对文本...`);
        const preprocPrompt = buildPreprocessingPrompt();
        const cleanedData = JSON.parse(await callAI('deepseek', ocrText, preprocPrompt, { jsonResponse: true, maxTokens: 2000 }));
        const cleanTextForAnalysis = `题目部分：\n${cleanedData.question_text}\n\n学生解答部分：\n${cleanedData.answer_text}`;
        
        updateLoadingStatus(`[${file.name}] 步骤 3/4: 初级评委正在独立评审...`);
        const juniorPrompt = buildJuniorJudgePrompt();
        const [reviewA_json, reviewB_json] = await Promise.all([
            callAI('deepseek', cleanTextForAnalysis, juniorPrompt, { jsonResponse: true, maxTokens: 2000 }),
            callAI('moonshot', cleanTextForAnalysis, juniorPrompt, { jsonResponse: true, maxTokens: 2000 })
        ]);
        const reviewA = JSON.parse(reviewA_json);
        const reviewB = JSON.parse(reviewB_json);

        updateLoadingStatus(`[${file.name}] 步骤 4/4: 首席执行官正在进行最终仲裁...`);
        const arbitrationPrompt = buildArbitrationPrompt();
        const arbitrationContent = `
        ### 学生作业原文:
        ${cleanTextForAnalysis}
        ### 评委1 (DeepSeek) 的评审意见:
        - 分数: ${reviewA.score}
        - 错误分析: ${reviewA.error_analysis}
        - 题目解析评估: ${JSON.stringify(reviewA.problem_analysis_evaluation)}
        ### 评委2 (Moonshot) 的评审意见:
        - 分数: ${reviewB.score}
        - 错误分析: ${reviewB.error_analysis}
        - 题目解析评估: ${JSON.stringify(reviewB.problem_analysis_evaluation)}
        `;
        const finalResultJson = await callAI('deepseek', arbitrationContent, arbitrationPrompt, { jsonResponse: true, maxTokens: 4000 });
        
        // ✨✨✨ 关键修正：在解析之前，不进行任何处理！让Prompt来保证JSON的合法性 ✨✨✨
        const finalResult = JSON.parse(finalResultJson);
        
        updateResultsUI(resultCard, finalResult);

    } catch (error) {
        console.error(`处理文件 ${file.name} 时发生严重错误:`, error);
        // ✨ 同时在UI上显示更详细的错误，方便调试
        const errorMessage = `错误类型: ${error.name}. 错误信息: ${error.message}. 请检查浏览器控制台获取更多信息。`;
        updateResultsUI(resultCard, null, true, errorMessage);
    }
}

async function callAI(modelKey, userContent, systemPrompt, options = {}) {
    // ... 函数内容保持不变 ...
    const { jsonResponse = false, maxTokens = 1500 } = options;
    const config = aiConfigs[modelKey];
    if (!config) throw new Error(`未找到名为'${modelKey}'的AI模型配置`);

    const body = {
        model: config.modelName,
        messages: [{ role: 'system', content: systemPrompt },{ role: 'user', content: userContent }],
        temperature: 0.1,
        max_tokens: maxTokens,
    };
    if (jsonResponse) body.response_format = { type: "json_object" };

    const response = await fetch(config.apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}`},
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`AI API 请求失败 (${modelKey}): ${response.status}. ${errorBody}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// ===================================
//  提示词构建函数们 (核心改动在这里)
// ===================================

function buildPreprocessingPrompt() {
    // ... 函数内容保持不变 ...
    return `你是一个顶级的OCR文本校对专家，尤其擅长处理包含手写数学公式的作业。你的任务是接收一段通过OCR识别后的、混乱的文本，然后将其清理、校对和结构化。
    1. **移除无关内容**: 删除所有广告、水印文字（例如 "夸克扫描王" 等）。
    2. **修正识别错误**: 根据上下文修正明显的OCR识别错误。
    3. **重建数学公式**: 尽你最大的努力，根据上下文和数学逻辑，恢复在OCR中丢失或错误的数学符号和结构。
    4. **结构化输出**: 将清理后的文本分为"问题"和"学生解答"两部分。
    你的输出必须遵循以下严格的JSON格式，不包含任何额外文本:
    { "question_text": "<清理和校对后的题目文本>", "answer_text": "<清理、校对和公式重建后的学生手写解答文本>" }`;
}

function buildJuniorJudgePrompt() {
    // ... 函数内容保持不变 ...
    return `你是一位严谨客观的数学AI助教。请根据学生提交的作业内容，按照以下规则进行评分和分析。
本题满分10分。
**评分规则:**
1.  **打分要求**: 只能给出整数分数。答案错误并非一分不得，要关注解题过程是否有正确的地方。
2.  **客观题 (选择/填空)**: 需仔细比对选项。若答案错误则为0分，没有过程分。
3.  **主观题 (解答题)**:
    - 最终答案正确：得2分。
    - 关键公式/核心推导过程正确：得6分。
    - 单位/符号规范性：得2分。
4.  **证明题**:
    - 10分：完整、严谨，逻辑无漏洞，表述清晰。
    - 9分：核心步骤正确，个别非关键细节省略。
    - 8分：思路正确，但有1-2处非本质错误或表述不清。
    - 5~7分：方向对，但关键步骤缺失或逻辑不完整。
    - 2~4分：核心错误或严重逻辑漏洞。
    - 0~1分：空白、完全无关。

**输出要求:**
你的输出必须是一个严格的JSON对象，格式如下，不包含任何额外文本：
{
  "score": <一个0到10的整数分数>,
  "error_analysis": "<对学生解答中所有错误的详细中文分析，如果没有错误则写'无'>",
  "problem_analysis_evaluation": {
    "mentioned_known_conditions": "<评估学生是否提到了'题目已知条件'，是或否>",
    "mentioned_key_formulas": "<评估学生是否列出了'关键公式'，是或否>",
    "mentioned_derivation_process": "<评估学生是否展示了'推导过程'，是或否>",
    "mentioned_common_mistakes": "<评估学生是否提及了'常见错误'，是或否>"
  }
}`;
}

// ✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨
// ✨               核心改动在这里             ✨
// ✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨
function buildArbitrationPrompt() {
    return `你是一位资深的首席学术仲裁官... (前面部分省略) ...

---
### 【权威解题范例】 ###
这是你生成 "problem_analysis" JSON对象时需要模仿的黄金标准。
为了确保JSON的合法性，所有在值中出现的LaTeX反斜杠 \`\\\` 都必须被转义成双反斜杠 \`\\\\\`。

**范例 "derivation_process" 的JSON值应该是这样：**
"我们的目标是计算...即求解后验概率 $P(H|P)$。整个推导过程如下：\\\\n\\\\n**第一步：定义事件并整理已知信息**...（省略中间步骤）...\\\\n\\\\n**第四步：应用贝叶斯定理计算最终结果**\\\\n...\\\\n$$P(H|P) = \\\\frac{P(P|H) \\\\cdot P(H)}{P(P)}$$\\\\n代入数值：\\\\n$$P(H|P) = \\\\frac{0.99 \\\\cdot 0.001}{0.02097} \\\\approx 0.04721$$。\\\\n\\\\n**结论：**\\\\n因此，即使测试结果为阳性，此人真正患病的概率约为 **4.72%**。"
### 【范例结束】 ###
---

**你的最终输出要求:**
请严格按照下面的JSON格式组织你的最终裁决。不要输出任何计算过程或额外解释。

{
  "final_score": <...>,
  "error_reason": "<...>",
  "problem_analysis": {
    "known_conditions": "<...>",
    "key_formulas": "<...>",
    "derivation_process": "<推导过程：严格遵循范例的详细步骤。 **【最重要规则】为了保证输出是合法的JSON，所有LaTeX中的反斜杠 \\必须被转义为 \\\\。例如，\\frac 必须写成 \\\\frac，\\n 必须写成 \\\\n。所有公式必须用 $...$ 或 $$...$$ 包围。**>",
    "common_mistakes": "<...>"
  },
  "evaluation": "<...>"
}
`;
}


async function extractTextViaOCR(file, ocrProgressCallback) {
    // ... 函数内容保持不变 ...
    const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
        logger: m => { if (ocrProgressCallback) ocrProgressCallback(m); },
    });
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        ocrProgressCallback({ status: `渲染第 ${i}/${pdfDoc.numPages} 页...`, progress: (i-1)/pdfDoc.numPages });
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const { data: { text } } = await worker.recognize(canvas);
        fullText += text + '\n\n';
        canvas.remove();
    }
    await worker.terminate();
    return fullText;
}


// ✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨
// ✨               核心改动在这里             ✨
// ✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨
function updateResultsUI(resultCard, data, isError = false, errorMessage = '') {
    const resultContentEl = resultCard.querySelector('.result-content');
    
    if (isError || !data) {
        resultContentEl.innerHTML = `<p><strong>分析失败:</strong> ${errorMessage || '未知错误'}</p>`;
        resultCard.classList.add('error');
        return;
    }

    const score = data.final_score;
    const errorReason = data.error_reason;
    const analysis = data.problem_analysis;
    const evaluation = data.evaluation;
    const maxScore = 10; 

    // ✨ 第二步：还原LaTeX ✨
    // AI为了生成合法JSON，输出了 "\\frac" 和 "\\n"。
    // JSON.parse后，它们在JS字符串里变成了 "\\frac" 和 "\\n"。
    // 我们需要把它们还原成KaTeX认识的 "\frac" 和 HTML认识的 "<br>"。
    const processedDerivation = analysis.derivation_process
                                  .replace(/\\\\/g, "\\") // 将双反斜杠 \\ 还原成单反斜杠 \
                                  .replace(/\\n/g, '<br/>'); // 将字符串 \n 转换成换行标签

    resultContentEl.innerHTML = `
        <p><strong>得分：</strong><span class="score">${score} / ${maxScore}</span></p>
        
        <p><strong>错误原因：</strong></p>
        <div class="analysis-block">${errorReason}</div>
        
        <p><strong>题目解析：</strong></p>
        <ul class="errors">
            <li><strong>题目已知条件:</strong> ${analysis.known_conditions}</li>
            <li><strong>关键公式:</strong> ${analysis.key_formulas}</li>
            <li>
                <strong>推导过程:</strong>
                <div class="derivation-process">${processedDerivation}</div>
            </li>
            <li><strong>常见错误:</strong> ${analysis.common_mistakes}</li>
        </ul>

        <p><strong>综合评价：</strong></p>
        <div class="evaluation-block">${evaluation}</div>
    `;

    // 样式部分保持不变
    const style = document.createElement('style');
    style.innerHTML = `
        .analysis-block, .evaluation-block {
            background-color: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;
            margin-bottom: 1rem; line-height: 1.6;
        }
        .derivation-process { word-wrap: break-word; }
    `;
    resultContentEl.appendChild(style);

    // 渲染部分保持不变
    renderMathInElement(resultContentEl, {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '\\[', right: '\\]', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\(', right: '\\)', display: false}
        ],
        throwOnError: false
    });
}