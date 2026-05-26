/**
 * 智能背诵助手 - 语音识别（腾讯云ASR）
 */

class SpeechRecognizer {
    constructor() {
        this.currentLang = 'zh-CN';
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
    }

    setLanguage(langCode) {
        this.currentLang = langCode;
    }

    async start(onResult, onEnd, onError) {
        if (AppState.recitation.isListening) {
            this.stop();
            return;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        AppState.recitation.isListening = false;
        updateMicButton(false);
    }

    async _sendToTencentASR(audioBlob, onResult, onEnd, onError) {
        try {
            updateSpeechResult('识别中...', false);

            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);

            reader.onloadend = async () => {
                const base64Audio = reader.result.split(',')[1];

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
            const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
            if (lang === 'en-US') {
                const words = currentSentence.split(' ');
                result = words.slice(0, Math.max(1, words.length - 2)).join(' ');
            } else {
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