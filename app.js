/**
 * 智能背诵助手 - 核心应用逻辑（优化版）
 */

// ==================== 全局状态 ====================
const AppState = {
    currentPage: 'home',
    content: {
        title: '',
        text: '',
        sentences: []
    },
    settings: {
        speechRate: 0.9,
        speechVolume: 1,
        autoNext: true
    },
    recitation: {
        mode: 'repeat',       // repeat, fill, hint, full
        currentIndex: 0,
        results: [],
        isListening: false,
        isSpeaking: false,
        isPaused: false,       // 新增：暂停状态
        hintLevel: 0,          // 新增：当前提示等级（渐进提示）
        retryCount: 0,         // 新增：当前句子重试次数
        maxRetries: 3          // 新增：最大重试次数
    },
    history: {
        records: [],
        achievements: [],
        stats: {
            totalCount: 0,
            avgScore: 0,
            streakDays: 0,
            todayCount: 0
        }
    }
};

// ==================== 语音合成 ====================
class SpeechSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.init();
    }

    init() {
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.setVoice();
        }
        this.setVoice();
    }

    setVoice() {
        const voices = this.synth.getVoices();
        this.voice = voices.find(v => v.lang.includes('zh') && v.name.includes('Female')) ||
                     voices.find(v => v.lang.includes('zh')) ||
                     voices[0];
    }

    speak(text, onEnd = null) {
        if (!this.synth) return;

        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.voice;
        utterance.rate = AppState.settings.speechRate;
        utterance.volume = AppState.settings.speechVolume;
        utterance.pitch = 1.1;

        AppState.recitation.isSpeaking = true;
        updateVoiceIndicator('speaking', text);

        utterance.onend = () => {
            AppState.recitation.isSpeaking = false;
            if (!AppState.recitation.isPaused) {
                updateVoiceIndicator('waiting');
            }
            if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
            console.error('语音合成错误:', e);
            AppState.recitation.isSpeaking = false;
            updateVoiceIndicator('idle');
        };

        this.synth.speak(utterance);
    }

    stop() {
        if (this.synth) {
            this.synth.cancel();
            AppState.recitation.isSpeaking = false;
        }
    }
}

const speechSynthesizer = new SpeechSynthesizer();

// ==================== 语音识别 ====================
class SpeechRecognizer {
    constructor() {
        this.recognition = null;
        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('浏览器不支持语音识别');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'zh-CN';
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
    }

    start(onResult, onEnd, onError) {
        if (!this.recognition) {
            simulateSpeechRecognition(onResult, onEnd);
            return;
        }

        let finalTranscript = '';

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            // 实时更新识别文字
            updateSpeechResult(finalTranscript || interimTranscript, !!finalTranscript);
            if (onResult) onResult(finalTranscript || interimTranscript, !!finalTranscript);
        };

        this.recognition.onend = () => {
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(finalTranscript);
        };

        this.recognition.onerror = (e) => {
            console.error('语音识别错误:', e);
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onError) onError(e);
        };

        AppState.recitation.isListening = true;
        updateMicButton(true);
        this.recognition.start();
    }

    stop() {
        if (this.recognition) {
            this.recognition.stop();
        }
        AppState.recitation.isListening = false;
        updateMicButton(false);
    }
}

const speechRecognizer = new SpeechRecognizer();

// 模拟语音识别（测试用）
function simulateSpeechRecognition(onResult, onEnd) {
    AppState.recitation.isListening = true;
    updateMicButton(true);
    
    setTimeout(() => {
        const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
        const isCorrect = Math.random() > 0.3;
        const result = isCorrect ? currentSentence : currentSentence.slice(0, -2);
        
        updateSpeechResult(result, true);
        if (onResult) onResult(result, true);
        
        setTimeout(() => {
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(result);
        }, 500);
    }, 2000);
}

// ==================== 页面导航 ====================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(pageId + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
        AppState.currentPage = pageId;
    }
}

function goHome() {
    speechSynthesizer.stop();
    speechRecognizer.stop();
    showPage('home');
    updateHomeStats();
}

function goBack() {
    if (AppState.currentPage === 'preview') {
        showPage('text-input');
    } else {
        goHome();
    }
}

// ==================== 首页功能 ====================
function showTextInput() {
    showPage('text-input');
}

function showImageInput() {
    showPage('image-input');
    initImageUpload();
}

function showHistory() {
    showPage('history');
    renderHistory();
}

function updateHomeStats() {
    const todayCount = AppState.history.stats.todayCount || 0;
    document.getElementById('today-count').textContent = todayCount;
}

// ==================== 文字输入功能 ====================
function previewContent() {
    const text = document.getElementById('content-text').value.trim();
    if (!text) { alert('请输入要背诵的内容'); return; }
    AppState.content.title = text.slice(0, 10) + (text.length > 10 ? '...' : '');
    AppState.content.text = text;
    AppState.content.sentences = splitIntoSentences(text);
    
    renderContentPreview();
    showPage('preview');
}

function splitIntoSentences(text) {
    const sentences = text
        .replace(/([。！？；.!?;])/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    return sentences.length > 0 ? sentences : [text];
}

function renderContentPreview() {
    document.getElementById('preview-title').textContent = AppState.content.title;
    const previewContainer = document.getElementById('content-preview');
    previewContainer.innerHTML = '';
    
    AppState.content.sentences.forEach((sentence, index) => {
        const div = document.createElement('div');
        div.className = 'sentence';
        div.textContent = `${index + 1}. ${sentence}`;
        previewContainer.appendChild(div);
    });
}

// ==================== 图片输入功能 ====================
function initImageUpload() {
    const uploadArea = document.getElementById('upload-area');
    const imageInput = document.getElementById('image-input');
    
    uploadArea.addEventListener('click', () => imageInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-color)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        }
    });
    
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });
}

function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('upload-area').classList.add('hidden');
        document.getElementById('image-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function resetImage() {
    document.getElementById('image-input').value = '';
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('ocr-result').classList.add('hidden');
}

function recognizeImage() {
    const btn = event.target;
    btn.textContent = '识别中...';
    btn.disabled = true;
    
    setTimeout(() => {
        const mockText = '床前明月光，\n疑是地上霜。\n举头望明月，\n低头思故乡。';
        document.getElementById('ocr-text').value = mockText;
        document.getElementById('ocr-result').classList.remove('hidden');
        btn.textContent = '识别文字';
        btn.disabled = false;
    }, 2000);
}

function previewOCRContent() {
    const text = document.getElementById('ocr-text').value.trim();
    if (!text) {
        alert('请先识别文字');
        return;
    }
    
    AppState.content.title = '图片识别内容';
    AppState.content.text = text;
    AppState.content.sentences = splitIntoSentences(text);
    
    renderContentPreview();
    showPage('preview');
}

// ==================== 模式选择 ====================
function selectMode(mode) {
    AppState.recitation.mode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
}

// ==================== 背诵功能（核心优化） ====================

/**
 * 开始背诵
 */
function startRecitation() {
    AppState.recitation.currentIndex = 0;
    AppState.recitation.results = [];
    AppState.recitation.isPaused = false;
    AppState.recitation.hintLevel = 0;
    AppState.recitation.retryCount = 0;
    
    document.getElementById('recitation-title').textContent = AppState.content.title;
    renderRecitationContent();
    updateProgress();
    updatePauseButton();
    
    showPage('recitation');
    
    // 开场语音
    setTimeout(() => {
        const openingText = `同学们好！今天我们来背诵《${AppState.content.title}》。准备好了吗？让我们开始吧！`;
        speechSynthesizer.speak(openingText, () => {
            startCurrentSentence();
        });
    }, 500);
}

/**
 * 渲染背诵内容 - 优化：聚焦当前句，折叠其他句子
 */
function renderRecitationContent() {
    const container = document.getElementById('content-display');
    container.innerHTML = '';
    
    const currentIdx = AppState.recitation.currentIndex;
    const total = AppState.content.sentences.length;
    
    AppState.content.sentences.forEach((sentence, index) => {
        const div = document.createElement('div');
        div.className = 'sentence-item';
        div.id = `sentence-${index}`;
        
        // 计算与当前句的距离
        const distance = Math.abs(index - currentIdx);
        
        if (index === currentIdx) {
            // 当前句 - 高亮显示
            div.classList.add('current');
            
            if (AppState.recitation.mode === 'fill') {
                // 填空模式：按标点智能断句
                const fillContent = getFillContent(sentence, AppState.recitation.hintLevel);
                div.innerHTML = fillContent;
            } else if (AppState.recitation.mode === 'hint') {
                // 提示模式：根据提示等级渐进显示
                const hintContent = getHintContent(sentence, AppState.recitation.hintLevel);
                div.innerHTML = hintContent;
            } else {
                div.textContent = sentence;
            }
        } else if (index < currentIdx) {
            // 已完成的句子
            const result = AppState.recitation.results[index];
            div.classList.add(result && result.isCorrect ? 'completed' : 'error');
            div.textContent = sentence;
            
            // 距离较远的已完成句子折叠
            if (distance > 2) {
                div.classList.add('collapsed');
            }
        } else {
            // 未到的句子
            div.textContent = sentence;
            
            // 距离较远的未来句子折叠
            if (distance > 2) {
                div.classList.add('collapsed');
            }
        }
        
        container.appendChild(div);
    });
    
    // 滚动到当前句
    const currentEl = document.getElementById(`sentence-${currentIdx}`);
    if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * 填空模式：按标点智能断句，支持渐进提示
 */
function getFillContent(sentence, hintLevel) {
    // 找到最后一个标点符号位置
    const punctuationMatch = sentence.match(/[，。！？、；：""''）】]/g);
    
    let splitPos;
    if (punctuationMatch && punctuationMatch.length > 0) {
        // 在中间标点处断开
        const midPunctIdx = Math.floor(punctuationMatch.length / 2);
        let count = 0;
        for (let i = 0; i < sentence.length; i++) {
            if (/[，。！？、；：""''）】]/.test(sentence[i])) {
                if (count === midPunctIdx) {
                    splitPos = i + 1;
                    break;
                }
                count++;
            }
        }
    }
    
    if (!splitPos) {
        splitPos = Math.ceil(sentence.length / 2);
    }
    
    const prefix = sentence.slice(0, splitPos);
    const suffix = sentence.slice(splitPos);
    
    if (hintLevel === 0) {
        // 完全隐藏后半部分
        return `${prefix}<span class="fill-blank">______</span>`;
    } else if (hintLevel === 1) {
        // 显示后半部分的首字
        return `${prefix}<span class="fill-blank">${suffix[0]}...</span>`;
    } else {
        // 显示完整内容
        return `${prefix}<span class="fill-blank revealed">${suffix}</span>`;
    }
}

/**
 * 提示模式：渐进显示内容
 */
function getHintContent(sentence, hintLevel) {
    if (hintLevel === 0) {
        // 只显示首字
        return `<span class="hint-text">${sentence[0]}</span><span class="hint-hidden">${'▪'.repeat(sentence.length - 1)}</span>`;
    } else if (hintLevel === 1) {
        // 显示前1/3
        const showLen = Math.max(1, Math.ceil(sentence.length / 3));
        return `<span class="hint-text">${sentence.slice(0, showLen)}</span><span class="hint-hidden">${'▪'.repeat(sentence.length - showLen)}</span>`;
    } else if (hintLevel === 2) {
        // 显示前2/3
        const showLen = Math.max(1, Math.ceil(sentence.length * 2 / 3));
        return `<span class="hint-text">${sentence.slice(0, showLen)}</span><span class="hint-hidden">${'▪'.repeat(sentence.length - showLen)}</span>`;
    } else {
        // 完全显示
        return `<span class="hint-text">${sentence}</span>`;
    }
}

/**
 * 更新进度条和句子计数
 */
function updateProgress() {
    const currentIdx = AppState.recitation.currentIndex;
    const total = AppState.content.sentences.length;
    const progress = total > 0 ? (currentIdx / total) * 100 : 0;
    
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-percent').textContent = `${Math.round(progress)}%`;
    document.getElementById('sentence-counter').textContent = `第 ${currentIdx + 1} 句 / 共 ${total} 句`;
}

/**
 * 开始当前句子的朗读/提示
 */
function startCurrentSentence() {
    if (AppState.recitation.isPaused) return;
    
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    const mode = AppState.recitation.mode;
    
    // 重置提示等级
    AppState.recitation.hintLevel = 0;
    renderRecitationContent();
    hideSpeechResult();
    
    if (mode === 'repeat') {
        speechSynthesizer.speak(`跟我一起读：${currentSentence}——`, () => {
            updateVoiceIndicator('waiting');
        });
    } else if (mode === 'fill') {
        const punctuationMatch = currentSentence.match(/[，。！？、；：""''）】]/g);
        let splitPos;
        if (punctuationMatch && punctuationMatch.length > 0) {
            const midPunctIdx = Math.floor(punctuationMatch.length / 2);
            let count = 0;
            for (let i = 0; i < currentSentence.length; i++) {
                if (/[，。！？、；：""''）】]/.test(currentSentence[i])) {
                    if (count === midPunctIdx) {
                        splitPos = i + 1;
                        break;
                    }
                    count++;
                }
            }
        }
        if (!splitPos) splitPos = Math.ceil(currentSentence.length / 2);
        const prefix = currentSentence.slice(0, splitPos);
        speechSynthesizer.speak(`${prefix}，接下来是什么？`, () => {
            updateVoiceIndicator('waiting');
        });
    } else if (mode === 'hint') {
        speechSynthesizer.speak(`第一个字是"${currentSentence[0]}"，想一想后面是什么？`, () => {
            updateVoiceIndicator('waiting');
        });
    } else if (mode === 'full') {
        if (AppState.recitation.currentIndex === 0) {
            speechSynthesizer.speak('请开始背诵', () => {
                updateVoiceIndicator('waiting');
            });
        } else {
            updateVoiceIndicator('waiting');
        }
    }
}

/**
 * 更新语音状态指示器 - 优化：区分更多状态
 * @param {'speaking'|'listening'|'waiting'|'idle'|'paused'} state
 */
function updateVoiceIndicator(state, text = '') {
    const indicator = document.getElementById('voice-indicator');
    const voiceText = document.getElementById('voice-text');
    const waves = indicator.querySelector('.voice-waves');
    
    // 移除所有状态类
    waves.classList.remove('listening', 'speaking', 'waiting', 'paused');
    indicator.classList.remove('state-speaking', 'state-listening', 'state-waiting', 'state-paused');
    
    if (state === 'speaking') {
        voiceText.textContent = `🔊 ${text.length > 15 ? text.slice(0, 15) + '...' : text}`;
        waves.classList.add('speaking');
        indicator.classList.add('state-speaking');
    } else if (state === 'listening') {
        voiceText.textContent = '🎤 正在听你说...';
        waves.classList.add('listening');
        indicator.classList.add('state-listening');
    } else if (state === 'waiting') {
        voiceText.textContent = '👆 点击麦克风开始';
        waves.classList.add('waiting');
        indicator.classList.add('state-waiting');
    } else if (state === 'paused') {
        voiceText.textContent = '⏸ 已暂停';
        waves.classList.add('paused');
        indicator.classList.add('state-paused');
    } else {
        voiceText.textContent = '准备开始';
    }
}

/**
 * 更新麦克风按钮状态
 */
function updateMicButton(isListening) {
    const micBtn = document.getElementById('mic-btn');
    const micHint = document.getElementById('mic-hint');
    
    if (isListening) {
        micBtn.classList.add('listening');
        micHint.textContent = '正在录音，再次点击结束';
    } else {
        micBtn.classList.remove('listening');
        micHint.textContent = '点击开始录音';
    }
}

/**
 * 更新实时语音识别文字显示
 */
function updateSpeechResult(text, isFinal) {
    const resultDiv = document.getElementById('speech-result');
    const resultText = document.getElementById('speech-result-text');
    
    resultDiv.classList.remove('hidden');
    resultText.textContent = text;
    resultText.classList.toggle('final', isFinal);
}

function hideSpeechResult() {
    const resultDiv = document.getElementById('speech-result');
    resultDiv.classList.add('hidden');
}

// ==================== 麦克风控制（优化：点击切换模式） ====================

function initMicButton() {
    const micBtn = document.getElementById('mic-btn');
    
    // 点击切换模式（替代原来的按住说话）
    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        if (AppState.recitation.isPaused) {
            // 暂停状态下不允许录音
            return;
        }
        
        if (AppState.recitation.isListening) {
            // 正在录音 → 停止
            stopListening();
        } else {
            // 未在录音 → 开始
            startListening();
        }
    });
    
    // 保留长按支持（兼容旧习惯）
    micBtn.addEventListener('mousedown', (e) => {
        // 不再需要长按逻辑，点击已足够
    });
}

function startListening() {
    if (AppState.recitation.isPaused) return;
    
    if (AppState.recitation.isSpeaking) {
        speechSynthesizer.stop();
    }
    
    speechRecognizer.start(
        (text, isFinal) => {
            if (isFinal) {
                handleRecitationResult(text);
            }
        },
        (finalText) => {
            if (finalText) {
                handleRecitationResult(finalText);
            }
        },
        (error) => {
            console.error('识别错误:', error);
            updateVoiceIndicator('waiting');
        }
    );
}

function stopListening() {
    speechRecognizer.stop();
    updateVoiceIndicator('waiting');
}

/**
 * 处理背诵结果 - 优化：支持重试次数限制，提供选择
 */
function handleRecitationResult(recitedText) {
    const currentIndex = AppState.recitation.currentIndex;
    const currentSentence = AppState.content.sentences[currentIndex];
    
    const evaluation = evaluateRecitation(currentSentence, recitedText);
    AppState.recitation.results[currentIndex] = evaluation;
    
    if (evaluation.isCorrect) {
        // 回答正确
        const encouragements = ['很好！', '不错！', '真棒！', '非常好！', '太厉害了！'];
        const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        speechSynthesizer.speak(randomEncouragement, () => {
            nextSentence();
        });
    } else {
        // 回答错误
        AppState.recitation.retryCount++;
        
        if (AppState.recitation.retryCount >= AppState.recitation.maxRetries) {
            // 超过最大重试次数，直接告诉答案并跳过
            speechSynthesizer.speak(`没关系，正确答案是"${currentSentence}"，我们继续下一句吧！`, () => {
                AppState.recitation.retryCount = 0;
                nextSentence();
            });
        } else {
            // 还有重试机会
            const remaining = AppState.recitation.maxRetries - AppState.recitation.retryCount;
            speechSynthesizer.speak(
                `接近了，应该是"${currentSentence}"，还有${remaining}次机会，再来一遍吧！`,
                () => {
                    setTimeout(() => startCurrentSentence(), 500);
                }
            );
        }
    }
}

// ==================== 评估逻辑 ====================

function evaluateRecitation(original, recited) {
    const cleanOriginal = preprocessText(original);
    const cleanRecited = preprocessText(recited);
    const similarity = calculateSimilarity(cleanOriginal, cleanRecited);
    const isCorrect = similarity >= 0.7;
    
    return {
        original,
        recited,
        similarity,
        isCorrect,
        accuracy: Math.round(similarity * 100)
    };
}

function preprocessText(text) {
    return text
        .replace(/[，。！？、；：""''（）【】]/g, '')
        .replace(/\s/g, '')
        .toLowerCase();
}

function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];
    
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
}

function nextSentence() {
    AppState.recitation.currentIndex++;
    AppState.recitation.retryCount = 0;
    AppState.recitation.hintLevel = 0;
    updateProgress();
    
    if (AppState.recitation.currentIndex >= AppState.content.sentences.length) {
        finishRecitation();
    } else {
        setTimeout(() => startCurrentSentence(), 500);
    }
}

function finishRecitation() {
    const results = AppState.recitation.results;
    const correctCount = results.filter(r => r && r.isCorrect).length;
    const totalCount = results.length;
    
    const avgAccuracy = results.reduce((sum, r) => sum + (r ? r.accuracy : 0), 0) / totalCount;
    const completeness = (correctCount / totalCount) * 100;
    const score = Math.round(avgAccuracy * 0.6 + completeness * 0.4);
    
    saveRecitationRecord(score, results);
    showResult(score, results);
}

// ==================== 控制按钮（优化） ====================

/**
 * 重读当前句
 */
function repeatCurrent() {
    if (AppState.recitation.isPaused) return;
    speechSynthesizer.stop();
    speechRecognizer.stop();
    hideSpeechResult();
    startCurrentSentence();
}

/**
 * 渐进提示 - 优化：多次点击逐步揭示更多内容
 */
function showHint() {
    if (AppState.recitation.isPaused) return;
    
    const maxHintLevel = 3;
    AppState.recitation.hintLevel = Math.min(AppState.recitation.hintLevel + 1, maxHintLevel);
    
    renderRecitationContent();
    
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    
    if (AppState.recitation.hintLevel >= maxHintLevel) {
        // 已到最大提示等级，直接显示答案
        speechSynthesizer.speak(`答案是"${currentSentence}"，记住它！`);
    } else {
        const hintTexts = [
            `再想想，提示：${currentSentence.slice(0, 2)}...`,
            `再提示一下：${currentSentence.slice(0, Math.ceil(currentSentence.length / 2))}...`,
            `最后一个提示：${currentSentence.slice(0, Math.ceil(currentSentence.length * 2 / 3))}...`
        ];
        speechSynthesizer.speak(hintTexts[AppState.recitation.hintLevel - 1] || hintTexts[0]);
    }
}

/**
 * 跳过当前句
 */
function skipCurrent() {
    speechSynthesizer.stop();
    speechRecognizer.stop();
    hideSpeechResult();
    
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    AppState.recitation.results[AppState.recitation.currentIndex] = {
        original: currentSentence,
        recited: '（已跳过）',
        similarity: 0,
        isCorrect: false,
        accuracy: 0
    };
    nextSentence();
}

/**
 * 暂停/继续 - 新增功能
 */
function togglePause() {
    AppState.recitation.isPaused = !AppState.recitation.isPaused;
    updatePauseButton();
    
    if (AppState.recitation.isPaused) {
        speechSynthesizer.stop();
        speechRecognizer.stop();
        updateVoiceIndicator('paused');
    } else {
        updateVoiceIndicator('waiting');
        // 恢复后重新开始当前句
        startCurrentSentence();
    }
}

function updatePauseButton() {
    const btn = document.getElementById('btn-pause');
    if (AppState.recitation.isPaused) {
        btn.innerHTML = '<span class="ctrl-icon">▶️</span><span class="ctrl-label">继续</span>';
        btn.classList.add('active');
    } else {
        btn.innerHTML = '<span class="ctrl-icon">⏸️</span><span class="ctrl-label">暂停</span>';
        btn.classList.remove('active');
    }
}

function confirmExit() {
    document.getElementById('exit-modal').classList.remove('hidden');
}

function closeExitModal() {
    document.getElementById('exit-modal').classList.add('hidden');
}

function confirmExitRecitation() {
    closeExitModal();
    speechSynthesizer.stop();
    speechRecognizer.stop();
    AppState.recitation.isPaused = false;
    goHome();
}

// ==================== 设置 ====================
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('hidden');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

document.getElementById('speech-rate')?.addEventListener('input', (e) => {
    AppState.settings.speechRate = parseFloat(e.target.value);
    document.getElementById('rate-value').textContent = e.target.value;
});

document.getElementById('speech-volume')?.addEventListener('input', (e) => {
    AppState.settings.speechVolume = parseFloat(e.target.value);
    document.getElementById('volume-value').textContent = Math.round(e.target.value * 100) + '%';
});

document.getElementById('auto-next')?.addEventListener('change', (e) => {
    AppState.settings.autoNext = e.target.checked;
});

// ==================== 结果展示 ====================
function showResult(score, results) {
    showPage('result');
    
    animateScore(score);
    
    const stars = calculateStars(score);
    document.getElementById('stars').textContent = stars;
    
    document.getElementById('result-comment').textContent = getComment(score);
    
    const correctCount = results.filter(r => r && r.isCorrect).length;
    const avgAccuracy = results.reduce((sum, r) => sum + (r ? r.accuracy : 0), 0) / results.length;
    
    document.getElementById('accuracy-value').textContent = Math.round(avgAccuracy) + '%';
    document.getElementById('accuracy-bar').style.width = avgAccuracy + '%';
    
    const completeness = (correctCount / results.length) * 100;
    document.getElementById('completeness-value').textContent = Math.round(completeness) + '%';
    document.getElementById('completeness-bar').style.width = completeness + '%';
    
    const fluency = Math.min(100, score + Math.random() * 20 - 10);
    document.getElementById('fluency-value').textContent = Math.round(fluency) + '%';
    document.getElementById('fluency-bar').style.width = fluency + '%';
    
    renderErrorAnalysis(results);
    
    const closingText = getClosingText(score);
    setTimeout(() => {
        speechSynthesizer.speak(closingText);
    }, 1000);
}

function animateScore(targetScore) {
    const scoreElement = document.getElementById('score-number');
    let currentScore = 0;
    const increment = targetScore / 30;
    const timer = setInterval(() => {
        currentScore += increment;
        if (currentScore >= targetScore) {
            currentScore = targetScore;
            clearInterval(timer);
        }
        scoreElement.textContent = Math.round(currentScore);
    }, 30);
}

function calculateStars(score) {
    if (score >= 90) return '🌟🌟🌟🌟🌟';
    if (score >= 75) return '🌟🌟🌟🌟';
    if (score >= 60) return '🌟🌟🌟';
    if (score >= 40) return '🌟🌟';
    return '🌟';
}

function getComment(score) {
    if (score >= 90) return '完美！你可以当小老师了！';
    if (score >= 75) return '非常棒！再练习几次就能满分了！';
    if (score >= 60) return '不错！继续加油，下次会更好！';
    if (score >= 40) return '有进步！我们再来一遍~';
    return '没关系，多练习就能记住！';
}

function getClosingText(score) {
    if (score >= 90) return '太棒了！你已经完全掌握了！给自己鼓鼓掌吧！';
    if (score >= 75) return '很不错！再练习几次会更熟练！';
    if (score >= 60) return '有进步！继续加油！';
    return '没关系，多练习就能记住！下次一定能更好！';
}

function renderErrorAnalysis(results) {
    const errorList = document.getElementById('error-list');
    errorList.innerHTML = '';
    
    const errors = results.filter(r => r && !r.isCorrect);
    
    if (errors.length === 0) {
        errorList.innerHTML = '<p style="color: var(--success-color);">🎉 太棒了！没有错误！</p>';
        return;
    }
    
    errors.forEach((error) => {
        const idx = results.indexOf(error);
        const div = document.createElement('div');
        div.className = 'error-item';
        div.innerHTML = `
            <div>第${idx + 1}句</div>
            <div>正确：<span class="expected">${error.original}</span></div>
            <div>你的：<span class="actual">${error.recited || '（未识别）'}</span></div>
        `;
        errorList.appendChild(div);
    });
}

function retryRecitation() {
    startRecitation();
}

function saveResult() {
    goHome();
}

// ==================== 历史记录 ====================
function saveRecitationRecord(score, results) {
    const record = {
        id: Date.now(),
        title: AppState.content.title,
        score: score,
        date: new Date().toISOString(),
        results: results
    };
    
    AppState.history.records.unshift(record);
    AppState.history.stats.totalCount++;
    AppState.history.stats.todayCount++;
    
    const totalScore = AppState.history.records.reduce((sum, r) => sum + r.score, 0);
    AppState.history.stats.avgScore = Math.round(totalScore / AppState.history.records.length);
    
    checkAchievements();
    saveToLocalStorage();
}

function checkAchievements() {
    const achievements = [
        { id: 'first', icon: '🏆', name: '背诵新手', condition: () => AppState.history.stats.totalCount >= 1 },
        { id: 'ten', icon: '📚', name: '积累达人', condition: () => AppState.history.stats.totalCount >= 10 },
        { id: 'perfect', icon: '⭐', name: '满分王者', condition: () => AppState.history.records.some(r => r.score >= 90) },
        { id: 'streak', icon: '🔥', name: '连续打卡', condition: () => AppState.history.stats.streakDays >= 7 }
    ];
    
    achievements.forEach(achievement => {
        if (achievement.condition() && !AppState.history.achievements.find(a => a.id === achievement.id)) {
            AppState.history.achievements.push({
                id: achievement.id,
                icon: achievement.icon,
                name: achievement.name,
                unlockedAt: new Date().toISOString()
            });
        }
    });
}

function renderHistory() {
    document.getElementById('total-count').textContent = AppState.history.stats.totalCount;
    document.getElementById('avg-score').textContent = AppState.history.stats.avgScore;
    document.getElementById('streak-days').textContent = AppState.history.stats.streakDays;
    
    const achievementList = document.getElementById('achievement-list');
    achievementList.innerHTML = '';
    
    const allAchievements = [
        { id: 'first', icon: '🏆', name: '背诵新手' },
        { id: 'ten', icon: '📚', name: '积累达人' },
        { id: 'perfect', icon: '⭐', name: '满分王者' },
        { id: 'streak', icon: '🔥', name: '连续打卡' }
    ];
    
    allAchievements.forEach(achievement => {
        const isUnlocked = AppState.history.achievements.find(a => a.id === achievement.id);
        const div = document.createElement('div');
        div.className = `achievement-item ${isUnlocked ? 'unlocked' : ''}`;
        div.innerHTML = `
            <span class="icon">${achievement.icon}</span>
            <span>${achievement.name}</span>
        `;
        achievementList.appendChild(div);
    });
    
    const historyItems = document.getElementById('history-items');
    historyItems.innerHTML = '';
    
    if (AppState.history.records.length === 0) {
        historyItems.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有背诵记录，快去开始第一次吧！</p>';
        return;
    }
    
    AppState.history.records.slice(0, 10).forEach(record => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const date = new Date(record.date);
        div.innerHTML = `
            <div class="info">
                <div class="title">${record.title}</div>
                <div class="date">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
            </div>
            <div class="score">${record.score}分</div>
        `;
        historyItems.appendChild(div);
    });
}

// ==================== 本地存储 ====================
function saveToLocalStorage() {
    try {
        localStorage.setItem('recitationHelper_history', JSON.stringify(AppState.history));
    } catch (e) {
        console.error('保存失败:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('recitationHelper_history');
        if (saved) {
            AppState.history = JSON.parse(saved);
        }
    } catch (e) {
        console.error('加载失败:', e);
    }
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    updateHomeStats();
    selectMode('repeat');
    
    // 初始化麦克风按钮（点击切换模式）
    initMicButton();
});

window.addEventListener('beforeunload', () => {
    saveToLocalStorage();
});
