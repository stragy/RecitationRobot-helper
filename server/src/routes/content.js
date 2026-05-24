const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { queryOne, query, run } = require('../db/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

// 预置的古诗词内容
const PRESET_CONTENTS = [
  {
    id: 'poem-001',
    title: '静夜思',
    author: '李白',
    dynasty: '唐',
    type: 'chinese_poem',
    original_text: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
    translation: '明亮的月光洒在床前，好像地上泛起的白霜。我抬起头来望向明月，低下头来思念远方的故乡。',
    annotation: JSON.stringify({
      keywords: ['明月', '霜', '故乡'],
      theme: '思乡',
      mood: '孤独、思念'
    }),
    background: '这首诗写于李白离家远游之时，表达了诗人对故乡的深切思念。',
    difficulty_level: 3
  },
  {
    id: 'poem-002',
    title: '春晓',
    author: '孟浩然',
    dynasty: '唐',
    type: 'chinese_poem',
    original_text: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。',
    translation: '春天睡觉睡得很香，不知不觉天已经亮了，到处可以听到鸟儿的啼叫声。回想昨夜的风雨声，不知道吹落了多少花朵。',
    annotation: JSON.stringify({
      keywords: ['春眠', '啼鸟', '风雨', '花落'],
      theme: '春景',
      mood: '闲适、惜春'
    }),
    background: '这首诗描绘了春天早晨的景象，表达了诗人对春天的喜爱。',
    difficulty_level: 3
  },
  {
    id: 'poem-003',
    title: '望庐山瀑布',
    author: '李白',
    dynasty: '唐',
    type: 'chinese_poem',
    original_text: '日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。',
    translation: '太阳照射香炉峰生出袅袅紫烟，远远望去瀑布像长河悬挂山前。仿佛三千尺水流飞奔直冲而下，好像是银河从九天之上落下来。',
    annotation: JSON.stringify({
      keywords: ['香炉', '紫烟', '瀑布', '银河'],
      theme: '山水',
      mood: '豪放、壮美'
    }),
    background: '这首诗描绘了庐山瀑布的壮丽景象，展现了李白豪放的诗风。',
    difficulty_level: 5
  },
  {
    id: 'poem-004',
    title: '登鹳雀楼',
    author: '王之涣',
    dynasty: '唐',
    type: 'chinese_poem',
    original_text: '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。',
    translation: '夕阳依傍着山峦渐渐沉落，黄河向着大海奔腾涌流。想要看到更远千里外的风光，就要再登上一层高楼。',
    annotation: JSON.stringify({
      keywords: ['白日', '黄河', '千里目'],
      theme: '登高',
      mood: '壮志、进取'
    }),
    background: '这首诗写诗人在登高望远中表现出来的不凡的胸襟抱负，反映了盛唐时期人们积极向上的进取精神。',
    difficulty_level: 4
  },
  {
    id: 'poem-005',
    title: '悯农',
    author: '李绅',
    dynasty: '唐',
    type: 'chinese_poem',
    original_text: '锄禾日当午，汗滴禾下土。谁知盘中餐，粒粒皆辛苦。',
    translation: '农民在正午时分顶着烈日锄禾，汗水滴落在禾苗生长的土地上。有谁知道盘中的饭食，每一粒都来自农民的辛苦。',
    annotation: JSON.stringify({
      keywords: ['锄禾', '汗滴', '盘中餐'],
      theme: '农事',
      mood: '同情、珍惜'
    }),
    background: '这首诗描绘了农民劳作的艰辛，表达了诗人对农民的同情和对粮食的珍惜。',
    difficulty_level: 3
  },
  // ==================== 英文内容 ====================
  {
    id: 'eng-001',
    title: 'The Road Not Taken',
    author: 'Robert Frost',
    dynasty: null,
    type: 'english_poem',
    original_text: 'Two roads diverged in a yellow wood, And sorry I could not travel both, And be one traveler, long I stood, And looked down one as far as I could, To where it bent in the undergrowth.',
    translation: '黄色的树林里分出两条路，可惜我不能同时去涉足，我在那路口久久伫立，我向着一条路极目望去，直到它消失在丛林深处。',
    annotation: JSON.stringify({
      keywords: ['road', 'choice', 'wood', 'travel'],
      theme: 'Life Choice',
      mood: 'Reflective, Nostalgic'
    }),
    background: 'This poem explores the theme of choices in life and their consequences.',
    difficulty_level: 6
  },
  {
    id: 'eng-002',
    title: 'I Have a Dream',
    author: 'Martin Luther King Jr.',
    dynasty: null,
    type: 'english_speech',
    original_text: 'I have a dream that one day this nation will rise up and live out the true meaning of its creed: We hold these truths to be self-evident, that all men are created equal.',
    translation: '我梦想有一天，这个国家将会奋起，实现其立国信条的真谛：我们认为这些真理不言而喻，人人生而平等。',
    annotation: JSON.stringify({
      keywords: ['dream', 'nation', 'equality', 'freedom'],
      theme: 'Equality',
      mood: 'Inspiring, Passionate'
    }),
    background: 'This is one of the most famous speeches in American history.',
    difficulty_level: 7
  },
  {
    id: 'eng-003',
    title: 'Pride and Prejudice Opening',
    author: 'Jane Austen',
    dynasty: null,
    type: 'english_paragraph',
    original_text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    translation: '一个富有的单身男人必定想要娶一位妻子，这是举世公认的真理。',
    annotation: JSON.stringify({
      keywords: ['truth', 'fortune', 'wife', 'single'],
      theme: 'Marriage and Society',
      mood: 'Witty, Ironic'
    }),
    background: 'The opening line of one of the most famous novels in English literature.',
    difficulty_level: 5
  },
  {
    id: 'eng-004',
    title: 'To be, or not to be',
    author: 'William Shakespeare',
    dynasty: null,
    type: 'english_drama',
    original_text: 'To be, or not to be, that is the question: Whether it is nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles.',
    translation: '生存还是毁灭，这是个问题：究竟哪样更高贵，是忍受命运暴虐的毒箭，还是挺身反抗人世无涯的苦难？',
    annotation: JSON.stringify({
      keywords: ['being', 'suffering', 'fortune', 'nobility'],
      theme: 'Existence',
      mood: 'Melancholic, Philosophical'
    }),
    background: 'Hamlet\'s famous soliloquy from Shakespeare\'s play.',
    difficulty_level: 8
  },
  // ==================== 初中英语内容 ====================
  {
    id: 'eng-005',
    title: 'How Can I Get to the Library?',
    author: null,
    dynasty: null,
    type: 'english_dialogue',
    original_text: 'Excuse me, could you tell me how to get to the library? Go down this street and turn left at the second corner. You can not miss it.',
    translation: '打扰一下，你能告诉我怎么去图书馆吗？沿着这条街走，在第二个拐角处左转。你一定找得到的。',
    annotation: JSON.stringify({
      keywords: ['excuse me', 'library', 'turn left', 'corner'],
      theme: 'Directions',
      mood: 'Polite, Helpful'
    }),
    background: 'A common English dialogue for asking directions.',
    difficulty_level: 2
  },
  {
    id: 'eng-006',
    title: 'What Do You Do?',
    author: null,
    dynasty: null,
    type: 'english_dialogue',
    original_text: 'What do you do? I am a teacher. Where do you work? I work at a school near my home. Do you like your job? Yes, I love it very much.',
    translation: '你是做什么工作的？我是一名教师。你在哪里工作？我在我家附近的一所学校工作。你喜欢你的工作吗？是的，我非常喜欢。',
    annotation: JSON.stringify({
      keywords: ['teacher', 'work', 'school', 'job'],
      theme: 'Occupation',
      mood: 'Friendly'
    }),
    background: 'A dialogue about occupations and work.',
    difficulty_level: 2
  }
];

// 初始化预置内容
function initPresetContents() {
  PRESET_CONTENTS.forEach(content => {
    const existing = queryOne('SELECT id FROM contents WHERE id = ?', [content.id]);
    if (!existing) {
      run(
        `INSERT INTO contents (id, title, author, dynasty, type, original_text, translation, annotation, background, difficulty_level) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [content.id, content.title, content.author, content.dynasty, content.type, 
         content.original_text, content.translation, content.annotation, content.background, content.difficulty_level]
      );
    }
  });
}

// 在模块加载时初始化
setTimeout(initPresetContents, 100);

// 获取内容列表
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { type, difficulty, limit = 20, offset = 0 } = req.query;
  
  let sql = 'SELECT * FROM contents WHERE 1=1';
  const params = [];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  
  if (difficulty) {
    sql += ' AND difficulty_level = ?';
    params.push(parseInt(difficulty));
  }
  
  sql += ' ORDER BY difficulty_level ASC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const contents = query(sql, params);
  
  res.json({
    success: true,
    data: contents
  });
}));

// 获取单个内容详情
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const content = queryOne('SELECT * FROM contents WHERE id = ?', [req.params.id]);
  
  if (!content) {
    return res.status(404).json({
      success: false,
      error: '内容不存在'
    });
  }
  
  // 如果用户已登录，获取该内容的掌握状态
  let mastery = null;
  if (req.user) {
    mastery = queryOne(
      'SELECT * FROM user_content_mastery WHERE user_id = ? AND content_id = ?',
      [req.user.id, req.params.id]
    );
  }
  
  res.json({
    success: true,
    data: {
      ...content,
      mastery: mastery || null
    }
  });
}));

// 获取推荐内容
router.get('/recommended/list', authMiddleware, asyncHandler(async (req, res) => {
  // 获取用户画像
  const profile = queryOne(
    'SELECT * FROM user_profiles WHERE user_id = ?',
    [req.user.id]
  );
  
  // 获取用户已学习的内容
  const learned = query(
    'SELECT content_id FROM user_content_mastery WHERE user_id = ?',
    [req.user.id]
  );
  const learnedIds = learned.map(l => l.content_id);
  
  // 获取待学习的内容
  let sql = 'SELECT * FROM contents';
  const params = [];
  
  if (learnedIds.length > 0) {
    sql += ` WHERE id NOT IN (${learnedIds.map(() => '?').join(',')})`;
    params.push(...learnedIds);
  }
  
  sql += ' ORDER BY difficulty_level ASC LIMIT 10';
  
  const recommended = query(sql, params);
  
  // 获取需要复习的内容
  const today = new Date().toISOString().split('T')[0];
  const toReview = query(
    `SELECT c.*, m.next_review_date, m.mastery_level 
     FROM contents c 
     JOIN user_content_mastery m ON c.id = m.content_id 
     WHERE m.user_id = ? AND m.next_review_date <= ? AND m.status != 'mastered'
     ORDER BY m.next_review_date ASC
     LIMIT 5`,
    [req.user.id, today]
  );
  
  res.json({
    success: true,
    data: {
      recommended,
      toReview
    }
  });
}));

// 创建自定义内容
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const { title, original_text, type = 'custom', translation, author } = req.body;
  
  if (!title || !original_text) {
    return res.status(400).json({
      success: false,
      error: '标题和内容不能为空'
    });
  }
  
  const id = uuidv4();
  
  run(
    `INSERT INTO contents (id, title, author, type, original_text, translation, difficulty_level) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, author || '用户创建', type, original_text, translation, 5]
  );
  
  const content = queryOne('SELECT * FROM contents WHERE id = ?', [id]);
  
  res.status(201).json({
    success: true,
    data: content
  });
}));

// 搜索内容
router.get('/search/query', optionalAuth, asyncHandler(async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({
      success: false,
      error: '请输入搜索关键词'
    });
  }
  
  const contents = query(
    `SELECT * FROM contents 
     WHERE title LIKE ? OR author LIKE ? OR original_text LIKE ?
     LIMIT 20`,
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );
  
  res.json({
    success: true,
    data: contents
  });
}));

module.exports = router;
