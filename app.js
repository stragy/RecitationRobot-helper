/**
 * 智能背诵助手 - 核心应用逻辑（优化版）
 */

// ==================== 全局状态 ====================
const AppState = {
    currentPage: 'home',
    content: {
        title: '',
        text: '',
        sentences: [],
        language: 'zh-CN'     // 新增：内容语言检测结果
    },
    settings: {
        speechRate: 0.9,
        speechVolume: 1,
        autoNext: true,
        language: 'auto'      // 语言设置 (auto/zh-CN/en-US)
    },
    recitation: {
        mode: 'repeat',       // repeat, fill, hint, full
        currentIndex: 0,
        results: [],
        isListening: false,
        isSpeaking: false,
        isPaused: false,       // 暂停状态
        hintLevel: 0,          // 当前提示等级（渐进提示）
        retryCount: 0,         // 当前句子重试次数
        maxRetries: 3          // 最大重试次数
    },
    capabilities: {
        speechSynthesis: false,  // 语音合成是否可用
        speechRecognition: false, // 语音识别是否可用
        microphone: false        // 麦克风是否可用
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

// ==================== 语言检测工具 ====================

/**
 * 检测浏览器功能支持情况
 */
async function detectCapabilities() {
    // 检测语音合成
    AppState.capabilities.speechSynthesis = 'speechSynthesis' in window;
    
    // 检测语音识别
    AppState.capabilities.speechRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    
    // 检测麦克风
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        AppState.capabilities.microphone = true;
        stream.getTracks().forEach(track => track.stop());
    } catch (e) {
        AppState.capabilities.microphone = false;
    }
    
    console.log('功能支持情况:', AppState.capabilities);
    
    // 如果麦克风不可用，显示警告
    if (!AppState.capabilities.microphone) {
        console.warn('麦克风不可用，请使用支持麦克风的设备');
    }
    
    return AppState.capabilities;
}

/**
 * 检测文本主要语言
 * @param {string} text - 要检测的文本
 * @returns {string} - 'zh-CN' 或 'en-US'
 */
function detectLanguage(text) {
    if (!text || text.trim().length === 0) return 'zh-CN';
    
    // 统计字符类型
    let chineseChars = 0;
    let englishChars = 0;
    let totalChars = 0;
    
    for (const char of text) {
        // 中文字符（包括中文标点）
        if (/[\u4e00-\u9fa5]/.test(char)) {
            chineseChars++;
            totalChars++;
        }
        // 英文字母
        else if (/[a-zA-Z]/.test(char)) {
            englishChars++;
            totalChars++;
        }
    }
    
    // 没有有效字符，默认中文
    if (totalChars === 0) return 'zh-CN';
    
    // 判断比例
    const chineseRatio = chineseChars / totalChars;
    const englishRatio = englishChars / totalChars;
    
    // 英文占比超过 60% 判定为英文
    if (englishRatio > 0.6) return 'en-US';
    
    // 否则默认中文
    return 'zh-CN';
}

/**
 * 获取语言显示名称
 */
function getLanguageName(langCode) {
    const names = {
        'zh-CN': '中文',
        'en-US': 'English',
        'auto': '自动检测'
    };
    return names[langCode] || langCode;
}

/**
 * 获取语言对应的语音
 */
function getVoiceForLanguage(voices, langCode) {
    // 优先找完全匹配的
    let voice = voices.find(v => v.lang === langCode);
    
    // 如果没有，找前缀匹配的（如 zh-CN 匹配 zh）
    if (!voice) {
        const prefix = langCode.split('-')[0];
        voice = voices.find(v => v.lang.startsWith(prefix));
    }
    
    return voice || voices[0];
}

// ==================== 语音合成 ====================
class SpeechSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.currentLang = 'zh-CN';
        this.init();
    }

    init() {
        // 加载语音列表
        this.loadVoices();
        
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoices();
        }
    }

    loadVoices() {
        this.voices = this.synth.getVoices();
    }

    /**
     * 设置当前语言
     * @param {string} langCode - 'zh-CN' 或 'en-US'
     */
    setLanguage(langCode) {
        this.currentLang = langCode;
    }

    getVoice() {
        // 根据当前语言选择语音
        return getVoiceForLanguage(this.voices, this.currentLang);
    }

    speak(text, onEnd = null) {
        // 如果语音合成不可用，显示文字提示
        if (!this.synth || !AppState.capabilities.speechSynthesis) {
            this._showTextPrompt(text, onEnd);
            return;
        }

        // 取消之前的语音
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.getVoice();
        utterance.lang = this.currentLang;
        utterance.rate = AppState.settings.speechRate;
        utterance.volume = AppState.settings.speechVolume;
        
        // 英文语音音调稍低，中文稍高
        utterance.pitch = this.currentLang === 'en-US' ? 1.0 : 1.1;

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
            
            // 语音合成失败时，降级到文字提示
            if (e.error !== 'canceled') {
                console.log('语音合成失败，降级到文字提示模式');
                this._showTextPrompt(text, onEnd);
            }
        };

        this.synth.speak(utterance);
    }

    /**
     * 显示文字提示（降级方案）
     */
    _showTextPrompt(text, onEnd) {
        AppState.recitation.isSpeaking = true;
        updateVoiceIndicator('speaking', text);
        
        // 显示文字提示
        showTextPrompt(text);
        
        // 模拟语音播放时间（按字数计算）
        const duration = Math.max(1500, text.length * 100);
        
        setTimeout(() => {
            AppState.recitation.isSpeaking = false;
            hideTextPrompt();
            if (!AppState.recitation.isPaused) {
                updateVoiceIndicator('waiting');
            }
            if (onEnd) onEnd();
        }, duration);
    }

    stop() {
        if (this.synth) {
            this.synth.cancel();
            AppState.recitation.isSpeaking = false;
        }
    }
}

const speechSynthesizer = new SpeechSynthesizer();

// ==================== 语音识别（腾讯云后端版）====================
class SpeechRecognizer {
    constructor() {
        this.currentLang = 'zh-CN';
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
    }

    /**
     * 设置识别语言
     * @param {string} langCode - 'zh-CN' 或 'en-US'
     */
    setLanguage(langCode) {
        this.currentLang = langCode;
    }

    /**
     * 开始录音和识别
     */
    async start(onResult, onEnd, onError) {
        // 如果已经在识别中，停止识别
        if (AppState.recitation.isListening) {
            this.stop();
            return;
        }

        try {
            // 请求麦克风权限
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 创建 MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                await this._sendToTencentASR(audioBlob, onResult, onEnd, onError);
            };

            // 开始录音
            this.mediaRecorder.start();
            AppState.recitation.isListening = true;
            updateMicButton(true);
            updateVoiceIndicator('listening');

        } catch (err) {
            console.error('录音启动失败:', err);
            let errorMsg = '无法启动录音';
            if (err.name === 'NotAllowedError') {
                errorMsg = '请允许使用麦克风权限';
            } else if (err.name === 'NotFoundError') {
                errorMsg = '未检测到麦克风设备';
            }
            showToast(errorMsg, 'error');
            if (onError) onError(err);
        }
    }

    /**
     * 停止录音
     */
    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        // 停止所有音轨
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        AppState.recitation.isListening = false;
        updateMicButton(false);
    }

    /**
     * 发送音频到腾讯云 ASR 后端
     */
    async _sendToTencentASR(audioBlob, onResult, onEnd, onError) {
        try {
            updateSpeechResult('识别中...', false);
            
            // 将音频转换为 base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            
            reader.onloadend = async () => {
                const base64Audio = reader.result.split(',')[1];
                
                // 调用后端 API（后端运行在 3000 端口）
                const response = await fetch('http://localhost:3000/api/v1/asr/sentence', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        audioBase64: base64Audio,
                        audioFormat: 'wav',
                        sampleRate: 16000,
                        language: this.currentLang === 'en-US' ? 'en' : 'zh'
                    })
                });

                const result = await response.json();

                if (result.success) {
                    updateSpeechResult(result.text, true);
                    if (onResult) onResult(result.text, true);
                    if (onEnd) onEnd(result.text);
                } else {
                    throw new Error(result.error || '识别失败');
                }
            };

        } catch (error) {
            console.error('腾讯云 ASR 错误:', error);
            showToast('语音识别失败: ' + error.message, 'error');
            if (onError) onError(error);
            if (onEnd) onEnd('');
        }
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
        let result;
        if (isCorrect) {
            result = currentSentence;
        } else {
            // 根据语言生成不同的错误结果
            const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
            if (lang === 'en-US') {
                // 英文：去掉最后几个单词
                const words = currentSentence.split(' ');
                result = words.slice(0, Math.max(1, words.length - 2)).join(' ');
            } else {
                // 中文：去掉最后两个字符
                result = currentSentence.slice(0, -2);
            }
        }
        
        updateSpeechResult(result, true);
        if (onResult) onResult(result, true);
        
        setTimeout(() => {
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(result);
        }, 500);
    }, 2000);
}

// ==================== 工具函数 ====================

/**
 * 显示文字提示（语音合成降级方案）
 */
function showTextPrompt(text) {
    let promptEl = document.getElementById('text-prompt');
    if (!promptEl) {
        promptEl = document.createElement('div');
        promptEl.id = 'text-prompt';
        promptEl.className = 'text-prompt';
        document.body.appendChild(promptEl);
    }
    promptEl.textContent = text;
    promptEl.classList.add('visible');
}

function hideTextPrompt() {
    const promptEl = document.getElementById('text-prompt');
    if (promptEl) {
        promptEl.classList.remove('visible');
    }
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'info') {
    // 检查是否已存在 toast 容器
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // 3秒后自动消失
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
    
    // 检测内容语言
    const detectedLang = detectLanguage(AppState.content.text);
    AppState.content.language = detectedLang;
    
    // 根据设置决定使用语言
    const useLang = AppState.settings.language === 'auto' ? detectedLang : AppState.settings.language;
    
    // 设置语音引擎语言
    speechSynthesizer.setLanguage(useLang);
    speechRecognizer.setLanguage(useLang);
    
    // 更新UI显示检测到的语言
    updateLanguageIndicator(useLang);
    
    document.getElementById('recitation-title').textContent = AppState.content.title;
    renderRecitationContent();
    updateProgress();
    updatePauseButton();
    
    showPage('recitation');
    
    // 开场语音（根据语言选择）
    setTimeout(() => {
        let openingText;
        if (useLang === 'en-US') {
            openingText = `Hello everyone! Today we will recite "${AppState.content.title}". Are you ready? Let's begin!`;
        } else {
            openingText = `同学们好！今天我们来背诵《${AppState.content.title}》。准备好了吗？让我们开始吧！`;
        }
        speechSynthesizer.speak(openingText, () => {
            startCurrentSentence();
        });
    }, 500);
}

/**
 * 更新语言指示器
 */
function updateLanguageIndicator(lang) {
    // 如果存在语言指示器元素则更新
    const indicator = document.getElementById('language-indicator');
    if (indicator) {
        indicator.textContent = getLanguageName(lang);
        indicator.className = `lang-badge ${lang === 'en-US' ? 'lang-en' : 'lang-zh'}`;
    }
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
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';
    
    let prefix, suffix;
    
    if (isEnglish) {
        // 英文：按空格分词
        const words = sentence.split(' ');
        const splitPos = Math.ceil(words.length / 2);
        prefix = words.slice(0, splitPos).join(' ');
        suffix = words.slice(splitPos).join(' ');
    } else {
        // 中文：按标点分割
        const punctuationMatch = sentence.match(/[，。！？、；：""''）】]/g);
        let splitPos;
        if (punctuationMatch && punctuationMatch.length > 0) {
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
        if (!splitPos) splitPos = Math.ceil(sentence.length / 2);
        prefix = sentence.slice(0, splitPos);
        suffix = sentence.slice(splitPos);
    }
    
    if (hintLevel === 0) {
        // 完全隐藏后半部分
        return `${prefix}<span class="fill-blank">______</span>`;
    } else if (hintLevel === 1) {
        // 显示后半部分的首字/首词
        const hint = isEnglish 
            ? (suffix.split(' ')[0] || suffix) + '...'
            : suffix[0] + '...';
        return `${prefix}<span class="fill-blank">${hint}</span>`;
    } else {
        // 显示完整内容
        return `${prefix}<span class="fill-blank revealed">${suffix}</span>`;
    }
}

/**
 * 提示模式：渐进显示内容
 */
function getHintContent(sentence, hintLevel) {
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';
    
    if (isEnglish) {
        // 英文：按词处理
        const words = sentence.split(' ');
        if (hintLevel === 0) {
            // 只显示首词
            return `<span class="hint-text">${words[0]}</span><span class="hint-hidden">${' ▪'.repeat(words.length - 1)}</span>`;
        } else if (hintLevel === 1) {
            // 显示前1/3的词
            const showCount = Math.max(1, Math.ceil(words.length / 3));
            return `<span class="hint-text">${words.slice(0, showCount).join(' ')}</span><span class="hint-hidden">${' ▪'.repeat(words.length - showCount)}</span>`;
        } else if (hintLevel === 2) {
            // 显示前2/3的词
            const showCount = Math.max(1, Math.ceil(words.length * 2 / 3));
            return `<span class="hint-text">${words.slice(0, showCount).join(' ')}</span><span class="hint-hidden">${' ▪'.repeat(words.length - showCount)}</span>`;
        } else {
            // 完全显示
            return `<span class="hint-text">${sentence}</span>`;
        }
    } else {
        // 中文：按字符处理
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
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';
    
    // 重置提示等级
    AppState.recitation.hintLevel = 0;
    renderRecitationContent();
    hideSpeechResult();
    
    if (mode === 'repeat') {
        const prompt = isEnglish 
            ? `Repeat after me: "${currentSentence}" ——`
            : `跟我一起读：${currentSentence}——`;
        speechSynthesizer.speak(prompt, () => {
            updateVoiceIndicator('waiting');
        });
    } else if (mode === 'fill') {
        let splitPos;
        if (isEnglish) {
            // 英文：按空格分词，取前半部分
            const words = currentSentence.split(' ');
            splitPos = Math.ceil(words.length / 2);
            const prefix = words.slice(0, splitPos).join(' ');
            const prompt = `${prefix}... What's next?`;
            speechSynthesizer.speak(prompt, () => {
                updateVoiceIndicator('waiting');
            });
        } else {
            // 中文：按标点分割
            const punctuationMatch = currentSentence.match(/[，。！？、；：""''）】]/g);
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
        }
    } else if (mode === 'hint') {
        if (isEnglish) {
            const firstWord = currentSentence.split(' ')[0];
            speechSynthesizer.speak(`The first word is "${firstWord}". What comes next?`, () => {
                updateVoiceIndicator('waiting');
            });
        } else {
            speechSynthesizer.speak(`第一个字是"${currentSentence[0]}"，想一想后面是什么？`, () => {
                updateVoiceIndicator('waiting');
            });
        }
    } else if (mode === 'full') {
        if (AppState.recitation.currentIndex === 0) {
            const prompt = isEnglish ? 'Please start reciting' : '请开始背诵';
            speechSynthesizer.speak(prompt, () => {
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
    
    // 检查麦克风是否可用
    if (!AppState.capabilities.microphone) {
        showToast('请使用支持麦克风的设备，并允许麦克风权限', 'error');
        return;
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
            showToast('语音识别失败，请检查网络连接后重试', 'error');
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
    
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';
    
    if (evaluation.isCorrect) {
        // 回答正确
        const encouragements = isEnglish 
            ? ['Great job!', 'Well done!', 'Excellent!', 'Perfect!', 'Amazing!']
            : ['很好！', '不错！', '真棒！', '非常好！', '太厉害了！'];
        const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        speechSynthesizer.speak(randomEncouragement, () => {
            nextSentence();
        });
    } else {
        // 回答错误
        AppState.recitation.retryCount++;
        
        if (AppState.recitation.retryCount >= AppState.recitation.maxRetries) {
            // 超过最大重试次数，直接告诉答案并跳过
            const msg = isEnglish
                ? `No worries, the correct answer is "${currentSentence}". Let's move on to the next one!`
                : `没关系，正确答案是"${currentSentence}"，我们继续下一句吧！`;
            speechSynthesizer.speak(msg, () => {
                AppState.recitation.retryCount = 0;
                nextSentence();
            });
        } else {
            // 还有重试机会
            const remaining = AppState.recitation.maxRetries - AppState.recitation.retryCount;
            const msg = isEnglish
                ? `Close! It should be "${currentSentence}". You have ${remaining} more ${remaining === 1 ? 'chance' : 'chances'}. Try again!`
                : `接近了，应该是"${currentSentence}"，还有${remaining}次机会，再来一遍吧！`;
            speechSynthesizer.speak(msg, () => {
                setTimeout(() => startCurrentSentence(), 500);
            });
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
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';
    
    if (AppState.recitation.hintLevel >= maxHintLevel) {
        // 已到最大提示等级，直接显示答案
        const msg = isEnglish
            ? `The answer is "${currentSentence}". Remember it!`
            : `答案是"${currentSentence}"，记住它！`;
        speechSynthesizer.speak(msg);
    } else {
        let hintTexts;
        if (isEnglish) {
            const words = currentSentence.split(' ');
            hintTexts = [
                `Think again. Hint: ${words.slice(0, 2).join(' ')}...`,
                `Another hint: ${words.slice(0, Math.ceil(words.length / 2)).join(' ')}...`,
                `Last hint: ${words.slice(0, Math.ceil(words.length * 2 / 3)).join(' ')}...`
            ];
        } else {
            hintTexts = [
                `再想想，提示：${currentSentence.slice(0, 2)}...`,
                `再提示一下：${currentSentence.slice(0, Math.ceil(currentSentence.length / 2))}...`,
                `最后一个提示：${currentSentence.slice(0, Math.ceil(currentSentence.length * 2 / 3))}...`
            ];
        }
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

// 语言选择
document.getElementById('language-select')?.addEventListener('change', (e) => {
    AppState.settings.language = e.target.value;
    // 如果正在背诵，实时切换语言
    if (AppState.currentPage === 'recitation' && AppState.content.text) {
        const newLang = e.target.value === 'auto' ? detectLanguage(AppState.content.text) : e.target.value;
        speechSynthesizer.setLanguage(newLang);
        speechRecognizer.setLanguage(newLang);
        updateLanguageIndicator(newLang);
    }
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
document.addEventListener('DOMContentLoaded', async () => {
    loadFromLocalStorage();
    updateHomeStats();
    selectMode('repeat');
    
    // 检测浏览器功能支持
    await detectCapabilities();
    
    // 如果麦克风不可用，显示提示
    if (!AppState.capabilities.microphone) {
        showToast('请使用支持麦克风的设备，并允许麦克风权限', 'warning');
    }
    
    // 初始化麦克风按钮（点击切换模式）
    initMicButton();
});

window.addEventListener('beforeunload', () => {
    saveToLocalStorage();
});
