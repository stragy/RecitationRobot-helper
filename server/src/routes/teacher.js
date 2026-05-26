const express = require('express');
const router = express.Router();
const { queryOne, query, run } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

// AI服务配置
let aiService = null;

// 初始化AI服务
function initAIService() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (apiKey && apiKey !== 'your-openai-api-key') {
    const OpenAI = require('openai').default;
    aiService = new OpenAI({
      apiKey: apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    });
    console.log('✅ AI服务初始化成功 (OpenAI)');
  } else {
    console.log('⚠️ 未配置AI API Key，将使用模拟响应');
  }
}

// 延迟初始化
setTimeout(initAIService, 500);

// 小爱老师对话
router.post('/chat', authMiddleware, asyncHandler(async (req, res) => {
  const { message, context, session_id } = req.body;
  
  if (!message) {
    return res.status(400).json({
      success: false,
      error: '消息不能为空'
    });
  }
  
  // 获取用户画像
  const profile = queryOne(
    'SELECT * FROM user_profiles WHERE user_id = ?',
    [req.user.id]
  );
  
  // 构建系统提示
  const systemPrompt = buildSystemPrompt(profile);
  
  // 调用AI生成回复
  let response;
  if (aiService) {
    try {
      const completion = await aiService.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(context || []).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          { role: 'user', content: message }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      
      response = completion.choices[0].message.content;
    } catch (err) {
      console.error('AI调用错误:', err);
      response = generateFallbackResponse(message);
    }
  } else {
    response = generateFallbackResponse(message);
  }
  
  res.json({
    success: true,
    data: {
      message: response,
      timestamp: new Date().toISOString()
    }
  });
}));

// 请求讲解
router.post('/explain', authMiddleware, asyncHandler(async (req, res) => {
  const { content_id, part } = req.body;
  
  // 获取内容
  const content = queryOne(
    'SELECT * FROM contents WHERE id = ?',
    [content_id]
  );
  
  if (!content) {
    return res.status(404).json({
      success: false,
      error: '内容不存在'
    });
  }
  
  // 生成讲解
  let explanation;
  if (aiService) {
    try {
      const prompt = `请用简单易懂的语言，为中小学生讲解以下古诗词${part ? '的"' + part + '"部分' : ''}：

《${content.title}》
${content.original_text}

请从以下几个方面讲解：
1. 字词含义
2. 句子意境
3. 表达的情感
4. 记忆技巧

讲解要生动有趣，适合学生理解。`;

      const completion = await aiService.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一位耐心、温暖的语文老师，擅长用生动有趣的方式讲解古诗词。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      });
      
      explanation = completion.choices[0].message.content;
    } catch (err) {
      console.error('AI调用错误:', err);
      explanation = generateDefaultExplanation(content);
    }
  } else {
    explanation = generateDefaultExplanation(content);
  }
  
  res.json({
    success: true,
    data: {
      explanation,
      content_id,
      part
    }
  });
}));

// 生成提示
router.post('/hint', authMiddleware, asyncHandler(async (req, res) => {
  const { standard_text, user_input, hint_level = 1 } = req.body;
  
  // 分析差异
  const analysis = analyzeDifference(standard_text, user_input);
  
  // 根据提示级别生成提示
  let hint;
  switch (hint_level) {
    case 1:
      // 首字提示
      hint = `第一个字是"${standard_text[0]}"...`;
      break;
    case 2:
      // 前半句提示
      const halfLength = Math.ceil(standard_text.length / 2);
      hint = `前半部分是"${standard_text.slice(0, halfLength)}"，想想后面是什么？`;
      break;
    case 3:
      // 完整提示
      hint = `正确答案是："${standard_text}"，我们再来一遍吧！`;
      break;
    default:
      hint = `提示：${standard_text.slice(0, 3)}...`;
  }
  
  res.json({
    success: true,
    data: {
      hint,
      hint_level,
      analysis
    }
  });
}));

// 构建系统提示
function buildSystemPrompt(profile) {
  let style = 'gentle';
  if (profile && profile.encouragement_style) {
    style = profile.encouragement_style;
  }
  
  const styleDescriptions = {
    gentle: '温柔耐心，语速适中，多给予鼓励',
    enthusiastic: '热情活泼，充满活力，用积极的语言',
    humorous: '幽默风趣，用有趣的比喻和例子',
    strict: '严谨认真，注重准确性和细节'
  };
  
  return `你是小爱老师，一位专业、耐心、温暖的AI背诵辅导老师。

你的性格特点：
- 耐心：从不厌烦，愿意反复讲解
- 洞察：能发现学生的细微困难
- 灵活：根据学生状态调整教学方法
- 温暖：真诚的鼓励和情感支持
- 专业：深谙记忆科学和教学法

教学风格：${styleDescriptions[style] || styleDescriptions.gentle}

你的任务是：
1. 帮助学生理解背诵内容
2. 提供有效的记忆技巧
3. 给予及时的反馈和鼓励
4. 调整教学策略适应学生状态

回复要求：
- 语言简洁，适合中小学生理解
- 多用鼓励性语言
- 可以使用表情符号增加亲和力
- 每次回复不超过100字`;
}

// 生成默认讲解（更自然的教师风格）
function generateDefaultExplanation(content) {
  const title = content.title || '这篇内容';
  const translation = content.translation || '';
  const background = content.background || '';
  const type = content.type || '';
  
  // 根据内容类型生成不同的讲解
  if (type.includes('english')) {
    return `📚 《${title}》讲解

${translation ? `中文翻译：${translation}\n` : ''}
${background ? `背景知识：${background}\n` : ''}

💡 记忆技巧：
- 先理解英文意思，再记忆原文
- 注意发音和语调，朗读有助于记忆
- 可以分段记忆，先记住关键词
- 尝试用自己的话复述一遍

加油，你一定可以背下来的！`;
  }
  
  return `📚 《${title}》讲解

${translation ? `译文：${translation}\n` : ''}
${background ? `背景：${background}\n` : ''}

💡 记忆技巧：
- 先理解意思，再记忆文字
- 可以想象画面帮助记忆
- 分段记忆，最后串联起来
- 注意押韵和节奏

加油，你一定可以背下来的！`;
}

// 增强的关键词匹配库
const KEYWORD_RESPONSES = {
  // 困难相关
  '不会': [
    '没关系，我们慢慢来。先理解意思，再一句句记忆。你觉得哪部分最难？',
    '别担心，每个人学习都会有困难的时候。我们可以先分析一下难点在哪里。',
    '遇到困难是正常的，这说明你在进步。我们可以从简单的部分开始。'
  ],
  '难': [
    '这部分确实有点难度，我们可以把它拆分成小段来学习。',
    '觉得难说明你在挑战自己，这是很好的学习态度。',
    '我们可以换个角度来理解，比如想象一下诗中的画面。'
  ],
  '记不住': [
    '记忆需要时间，我们可以用一些记忆技巧，比如联想记忆法。',
    '试试分段记忆，先记住第一句，再慢慢增加。',
    '可以多读几遍，培养语感，记忆会更自然。'
  ],
  '忘记': [
    '忘记是正常的，这正是复习的好时机。',
    '没关系，我们再来一遍，这次会记得更牢。',
    '可以试试把内容编成一个小故事，这样更容易记住。'
  ],
  
  // 提示相关
  '提示': [
    '好的，让我给你一些提示。先从第一个字开始想...',
    '提示：注意押韵和节奏，这有助于回忆。',
    '可以想想上一句是什么，这有助于连接记忆。'
  ],
  'hint': [
    'Let me give you a hint: think about the first word...',
    'Hint: pay attention to the rhythm and rhyme.',
    'Try to recall the previous sentence to connect your memory.'
  ],
  
  // 完成相关
  '背完了': [
    '太棒了！你真的很努力！要继续保持哦~ 💪',
    '恭喜你完成了背诵！你的坚持值得表扬！',
    '做得非常好！记得定期复习，让记忆更牢固。'
  ],
  '完成了': [
    '任务完成得很棒！给自己一点鼓励吧！',
    '完成得很好！学习是一个持续的过程，继续保持！',
    '为你感到骄傲！每一次完成都是进步。'
  ],
  
  // 疲劳相关
  '累了': [
    '辛苦了！学习也要注意劳逸结合，休息一下再来吧~ 😊',
    '累了就休息一下，学习需要劳逸结合。',
    '休息是为了更好的学习，放松一下再继续。'
  ],
  '休息': [
    '好的，休息一下吧。学习需要张弛有度。',
    '休息是必要的，可以听听音乐或者活动一下。',
    '适当休息可以提高学习效率，休息好了再继续。'
  ],
  
  // 鼓励相关
  '加油': [
    '加油！我相信你可以的！',
    '继续努力，你离成功越来越近了！',
    '坚持就是胜利，加油！'
  ],
  '鼓励': [
    '你做得很好，继续保持！',
    '每一次尝试都是进步，为你点赞！',
    '学习需要耐心，你已经做得很棒了！'
  ],
  
  // 问题相关
  '为什么': [
    '这个问题问得很好！我们可以一起探讨一下。',
    '理解"为什么"有助于加深记忆，我们来看看。',
    '这是一个很好的思考，我们可以从多个角度来理解。'
  ],
  '什么意思': [
    '我们来一起分析一下这句话的意思。',
    '理解意思是背诵的第一步，我们可以慢慢来。',
    '这句话的意思是...（根据上下文解释）'
  ],
  
  // 情绪相关
  '开心': [
    '看到你开心我也很高兴！学习应该是快乐的。',
    '开心学习效果更好，继续保持好心情！',
    '为你感到高兴！学习有进步是最让人开心的事。'
  ],
  '沮丧': [
    '别灰心，学习过程中有起伏是正常的。',
    '感到沮丧时，可以想想你已经取得的进步。',
    '每个人都会遇到困难，重要的是不放弃。'
  ]
};

// 通用鼓励响应库
const ENCOURAGEMENT_RESPONSES = [
  '继续加油，你做得很好！',
  '相信自己，你一定可以的！',
  '慢慢来，不着急，我会一直陪着你。',
  '每一次练习都是进步，继续努力！',
  '你已经很棒了，继续保持！',
  '学习需要耐心，你已经做得很好了！',
  '看到你的进步，为你感到骄傲！',
  '坚持就是胜利，你离成功越来越近了！',
  '别怕犯错，错误是学习的好机会。',
  '你的努力我看得到，继续加油！',
  '学习是一个过程，享受这个过程很重要。',
  '今天比昨天有进步，这就是成功！',
  '你的坚持让我很感动，继续努力！',
  '学习需要时间，给自己一点耐心。',
  '你已经迈出了重要的一步，很棒！'
];

// 教学策略响应库
const TEACHING_STRATEGIES = [
  '我们可以试试分段记忆法：先记住第一句，再慢慢增加。',
  '想象一下诗中的画面，这有助于理解和记忆。',
  '可以尝试朗读几遍，培养语感会让记忆更自然。',
  '把内容编成一个小故事，这样更容易记住。',
  '注意押韵和节奏，这有助于回忆。',
  '理解意思后再背诵，效果会更好。',
  '可以尝试用手势或动作来帮助记忆。',
  '把难记的部分写在纸上，多看几遍。',
  '尝试用自己的话复述一遍，加深理解。',
  '可以和朋友一起背诵，互相提醒。'
];

// 生成备用响应
function generateFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  // 检查关键词匹配
  for (const [keyword, responses] of Object.entries(KEYWORD_RESPONSES)) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }
  
  // 检查英文关键词
  if (lowerMessage.includes('difficult') || lowerMessage.includes('hard')) {
    return 'This part might be a bit challenging. Let\'s break it down into smaller pieces.';
  }
  
  if (lowerMessage.includes('forget') || lowerMessage.includes('forgot')) {
    return 'Forgetting is normal, it\'s a good time to review. Let\'s try again.';
  }
  
  if (lowerMessage.includes('tired')) {
    return 'It\'s important to take breaks. Rest for a while and come back refreshed.';
  }
  
  if (lowerMessage.includes('finished') || lowerMessage.includes('done')) {
    return 'Great job! You\'ve completed the task. Keep up the good work!';
  }
  
  // 根据消息长度和内容选择响应策略
  if (message.length > 20) {
    // 长消息可能是具体问题，提供教学策略
    return TEACHING_STRATEGIES[Math.floor(Math.random() * TEACHING_STRATEGIES.length)];
  } else if (message.includes('？') || message.includes('?')) {
    // 问题类型
    return '这个问题问得很好！我们可以一起探讨一下。';
  } else {
    // 短消息或陈述，使用鼓励响应
    return ENCOURAGEMENT_RESPONSES[Math.floor(Math.random() * ENCOURAGEMENT_RESPONSES.length)];
  }
}

// 分析差异
function analyzeDifference(standard, user_input) {
  if (!standard || !user_input) {
    return { match_rate: 0, suggestions: ['请开始背诵'] };
  }
  
  const cleanStandard = standard.replace(/[，。！？、；：""''（）【】\s]/g, '');
  const cleanInput = user_input.replace(/[，。！？、；：""''（）【】\s]/g, '');
  
  let matchCount = 0;
  const minLen = Math.min(cleanStandard.length, cleanInput.length);
  
  for (let i = 0; i < minLen; i++) {
    if (cleanStandard[i] === cleanInput[i]) {
      matchCount++;
    }
  }
  
  const matchRate = cleanStandard.length > 0 ? matchCount / cleanStandard.length : 0;
  
  const suggestions = [];
  if (matchRate < 0.5) {
    suggestions.push('可以先理解意思再记忆');
  } else if (matchRate < 0.8) {
    suggestions.push('很接近了，注意细节');
  } else {
    suggestions.push('非常好，继续保持！');
  }
  
  return {
    match_rate: Math.round(matchRate * 100),
    suggestions
  };
}

module.exports = router;
