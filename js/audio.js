/**
 * 智能背诵助手 - 语音TTS/录音相关
 */

// ==================== 语音合成 ====================
class SpeechSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.currentLang = 'zh-CN';
        this.init();
    }

    init() {
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoices();
        }
    }

    loadVoices() {
        this.voices = this.synth.getVoices();
    }

    setLanguage(langCode) {
        this.currentLang = langCode;
    }

    getVoice() {
        return getVoiceForLanguage(this.voices, this.currentLang);
    }

    speak(text, onEnd = null) {
        if (!this.synth || !AppState.capabilities.speechSynthesis) {
            this._showTextPrompt(text, onEnd);
            return;
        }

        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.getVoice();
        utterance.lang = this.currentLang;
        utterance.rate = AppState.settings.speechRate;
        utterance.volume = AppState.settings.speechVolume;
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
            if (e.error !== 'canceled') {
                console.log('语音合成失败，降级到文字提示模式');
                this._showTextPrompt(text, onEnd);
            }
        };

        this.synth.speak(utterance);
    }

    _showTextPrompt(text, onEnd) {
        AppState.recitation.isSpeaking = true;
        updateVoiceIndicator('speaking', text);
        showTextPrompt(text);

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