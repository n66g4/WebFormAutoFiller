const WebFormFieldKey = {
  generate(label, index) {
    if (!label) return `FIELD${index + 1}`;

    const chineseChars = label.match(/[\u4e00-\u9fa5]/g);
    if (chineseChars && chineseChars.length > 0) {
      let key = '';
      for (let i = 0; i < Math.min(chineseChars.length, 6); i++) {
        const initial = this._pinyinInitial(chineseChars[i]);
        if (initial) key += initial;
      }
      if (key.length >= 2) return key.toUpperCase();
    }

    const englishKey = label.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
    if (englishKey.length >= 2) return englishKey;

    return `FIELD${index + 1}`;
  },

  generateConfigId(name) {
    if (!name) return 'new-config';

    const chineseChars = name.match(/[\u4e00-\u9fa5]/g);
    if (chineseChars && chineseChars.length > 0) {
      let id = '';
      for (let i = 0; i < Math.min(chineseChars.length, 6); i++) {
        const initial = this._pinyinInitial(chineseChars[i]);
        if (initial) id += initial.toLowerCase();
      }
      if (id.length >= 2) return id;
    }

    const englishId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return englishId || 'new-config';
  },

  _pinyinInitial(char) {
    const map = {
      '收': 'S', '件': 'J', '受': 'S', '理': 'L', '审': 'S', '查': 'C',
      '决': 'J', '定': 'D', '制': 'Z', '证': 'Z', '送': 'S', '达': 'D',
      '办': 'B', '人': 'R', '时': 'S', '限': 'X', '标': 'B', '准': 'Z',
      '结': 'J', '果': 'G', '权': 'Q', '力': 'L', '来': 'L', '源': 'Y',
      '责': 'Z', '任': 'R', '事': 'S', '项': 'X', '处': 'C', '罚': 'F',
      '为': 'W', '种': 'Z', '类': 'L', '名': 'M', '称': 'C', '地': 'D',
      '址': 'Z', '电': 'D', '话': 'H', '信': 'X', '息': 'X', '法': 'F',
      '律': 'L', '内': 'N', '容': 'R', '日': 'R', '期': 'Q', '间': 'J',
      '数': 'S', '量': 'L', '单': 'D', '位': 'W', '型': 'X', '填': 'T',
      '入': 'R', '选': 'X', '择': 'Z', '备': 'B', '注': 'Z', '说': 'S',
      '明': 'M', '申': 'S', '请': 'Q', '编': 'B', '号': 'H', '码': 'M'
    };
    return map[char] || null;
  }
};
