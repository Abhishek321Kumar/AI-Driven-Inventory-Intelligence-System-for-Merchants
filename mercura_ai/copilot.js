(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MercuraCopilot = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var ALIAS = [
    [/polo|\bcp-330\b/, "CP-330"],
    [/kurti|कुर्त|ಕುರ್ತಿ|\bkt-204\b/, "KT-204"],
    [/sandal|सैंडल|ಸ್ಯಾಂಡ|chappal|चप्पल|\bsd-881\b/, "SD-881"],
    [/sneaker|airsprint|running shoe|\bsh-102\b/, "SH-102"],
    [/scarf|glove|स्कार्फ|ಸ್ಕಾರ್ಫ್|ದುಪಟ್ಟ|\bacc-091\b/, "ACC-091"],
    [/jacket|जैकेट|ಜಾಕೆಟ್|coat|\bjkt-409\b/, "JKT-409"],
    [/jean|denim|जींस|ಜೀನ್|\bjn-204\b/, "JN-204"],
    [/track|jogger|\btp-505\b/, "TP-505"],
    [/linen|\bsh-312\b/, "SH-312"],
    [/tee|t-shirt|टी\s?शर्ट|\bts-088\b|crew/, "TS-088"],
    [/wrap|\bbw-014\b/, "BW-014"]
  ];

  function inr(n) {
    return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  }

  function pickLang(q, selected) {
    var text = String(q || "");
    if (/[\u0C80-\u0CFF]/.test(text)) return "kn";
    if (/[\u0900-\u097F]/.test(text)) return "hi";
    var s = text.toLowerCase();
    var kn = /eshtu|ivattu|heli|idide|maarata|laabha|namaskara|yaava|yavudu/.test(s);
    var hi = /kitn[aei]|kya|kaise|\bhai\b|\bhain\b|bache|batao|\baaj\b|munafa|bikri|\bbika\b|dhire|khatam|namaste|\bkaun\b|rupaye|paisa/.test(s);
    var en = /\b(how|what|where|when|why|many|much|left|are|is|the|please|show|sales|profit|today|down|slow|sold|hello|help|inventory)\b/.test(s);
    if (kn && !hi) return "kn";
    if (hi) return "hi";
    if (en) return "en";
    return selected === "hi" || selected === "kn" ? selected : "en";
  }

  function findHits(q, skus) {
    var s = String(q || "").toLowerCase();
    var ids = [];
    function add(id) {
      if (id && ids.indexOf(id) === -1 && skus.some(function (p) { return p.id === id; })) ids.push(id);
    }
    ALIAS.forEach(function (pair) { if (pair[0].test(s)) add(pair[1]); });
    skus.forEach(function (p) {
      var name = String(p.name || "").toLowerCase();
      var id = String(p.id || "").toLowerCase();
      if (name && s.indexOf(name) !== -1) add(p.id);
      if (id && s.indexOf(id) !== -1) add(p.id);
      if (p.supplier && s.indexOf(String(p.supplier).toLowerCase()) !== -1) add(p.id);
    });
    if (!ids.length) {
      var cats = [
        [/skirt|स्कर्ट|ಸ್ಕರ್ಟ್/, "Skirts"],
        [/dress|kurti|कुर्त|ಕುರ್ತಿ/, "Dresses"],
        [/jacket|जैकेट|ಜಾಕೆಟ್/, "Jackets"],
        [/sandal|सैंडल|ಸ್ಯಾಂಡ/, "Shoes"],
        [/shoe|footwear|जूत|ಶೂ/, "Shoes"],
        [/pant|jean|पैंट|ಪ್ಯಾಂಟ್|ಜೀನ್/, "Pants"],
        [/shirt|tee|polo|शर्ट|ಶರ್ಟ್/, "Shirts"],
        [/scarf|accessor|स्कार्फ|ಸ್ಕಾರ್ಫ್/, "Accessories"],
        [/wrap|रैप/, "Wraps"]
      ];
      cats.forEach(function (c) {
        if (!c[0].test(s)) return;
        skus.forEach(function (p) { if (p.cat === c[1]) add(p.id); });
      });
    }
    return ids.map(function (id) { return skus.filter(function (p) { return p.id === id; })[0]; });
  }

  function flags(s) {
    var slow = /sales down|slow|धीमी|ನಿಧಾನ|dead stock|डेड स्टॉक/.test(s);
    var soldOut = /sold out|out of stock|खत्म|ಮುಗಿದ|khatam/.test(s);
    var sold = !soldOut && /sold|बिके|बिका|बेचे|देखे|ಮಾರಾಟವಾಯಿತು/.test(s);
    var money = !slow && /रुप|rupee|सेल|\bsale|\bsales|revenue|बिक्री|amount|नंबर|ನಂಬರ್|ಹಣ/.test(s);
    var cover = /days left|days of|cover|कितने दिन|ದಿನ ಉಳಿದ/.test(s);
    var countingProducts = /products|skus|items|प्रोडक्ट|ವಸ್ತು/.test(s);
    var stock = !cover && !countingProducts && (/left|stock|स्टॉक|ಸ್ಟಾಕ್|बचे|उಳಿದ|on hand|बाकी|remaining/.test(s) || (/how many|kitn|कितन|ಎಷ್ಟು|eshtu/.test(s) && !sold && !money));
    return {
      price: /price|कीमत|दाम|ಬೆಲೆ|keemat|\brate\b/.test(s),
      cost: /cost|लागत|ಖರ್ಚು|buying price/.test(s),
      profit: /profit|मुनाफा|ಲಾಭ|munafa|फायदा/.test(s),
      margin: /margin/.test(s),
      status: soldOut || slow || /status|स्थिति|ಸ್ಥಿತಿ/.test(s),
      today: /today|आज|\baaj\b|ಇವತ್ತು|ಇಂದು|ivattu/.test(s),
      money: money,
      sold: sold,
      stock: stock,
      age: /how old|\bage\b|पुरान|inventory age|दिनों से/.test(s),
      speed: /velocity|per day|\bspeed\b|तेज|ವೇಗ|रोज़|रोज/.test(s) && !/fastest|सबसे तेज|ಅತಿ ವೇಗ/.test(s),
      cover: cover,
      supplier: /supplie|vendor|phone|email|contact|सप्लाई|ಸರಬರಾಜು/.test(s),
      lead: /lead time|लीड|delivery/.test(s),
      capital: /capital|at risk|जोखिम|tied up|फँस/.test(s),
      channel: /shopify|warehouse|गोदाम|\bpos\b|offline/.test(s),
      clearance: /clearance|discount|छूट|डिस्काउंट/.test(s)
    };
  }

  function statusWord(status, lang) {
    var map = {
      en: { out: "sold out", reorder: "reorder", dead: "dead stock", risk: "sales down", low: "low stock", critical: "low stock", healthy: "healthy" },
      hi: { out: "बिक चुका है", reorder: "फिर से ऑर्डर", dead: "डेड स्टॉक", risk: "बिक्री धीमी है", low: "स्टॉक कम है", critical: "स्टॉक कम है", healthy: "ठीक है" },
      kn: { out: "ಮಾರಾಟವಾಗಿದೆ", reorder: "ಮರು ಆರ್ಡರ್", dead: "ಡೆಡ್ ಸ್ಟಾಕ್", risk: "ಮಾರಾಟ ನಿಧಾನ", low: "ಸ್ಟಾಕ್ ಕಡಿಮೆ", critical: "ಸ್ಟಾಕ್ ಕಡಿಮೆ", healthy: "ಸರಿ ಇದೆ" }
    };
    return (map[lang] || map.en)[status] || status;
  }

  function names(list) {
    return list.map(function (s) { return s.name; }).join(", ");
  }

  function todayOf(p, book) {
    var price = Number(p.listPrice || p.price) || 0;
    var rows = (book.today || []).filter(function (t) { return t.sku === p.id || t.name === p.name; });
    return {
      qty: rows.reduce(function (a, t) { return a + (Number(t.qty) || 0); }, 0),
      money: rows.reduce(function (a, t) { return a + (Number(t.revenue) || Math.round((Number(t.qty) || 0) * price)); }, 0)
    };
  }

  function describe(lang, p, w, book) {
    var price = Number(p.listPrice || p.price) || 0;
    var cost = Number(p.cost) || 0;
    var sold = Number(p.sold) || 0;
    var t = todayOf(p, book);
    var bits = [];
    function say3(en, hi, kn) { bits.push(lang === "hi" ? hi : lang === "kn" ? kn : en); }
    if (w.supplier) {
      var who = String(p.supplier || "").replace(/\.$/, "") || (lang === "hi" ? "अनजान" : lang === "kn" ? "ತಿಳಿದಿಲ್ಲ" : "an unknown supplier");
      var reach = [p.phone, p.email].filter(Boolean).join(" ");
      say3(p.name + " comes from " + who + (reach ? " " + reach : "") + ".", p.name + " " + who + " से आता है" + (reach ? " " + reach : "") + "।", p.name + " " + who + " ಇಂದ ಬರುತ್ತದೆ" + (reach ? " " + reach : "") + ".");
    }
    if (w.price) say3(p.name + " is " + inr(price) + ".", p.name + " की कीमत " + inr(price) + " है।", p.name + " ಬೆಲೆ " + inr(price) + ".");
    if (w.cost) say3(p.name + " costs " + inr(cost) + ".", p.name + " की लागत " + inr(cost) + " है।", p.name + " ಖರ್ಚು " + inr(cost) + ".");
    if (w.age) say3(p.name + " has been here " + p.age + " days.", p.name + " " + p.age + " दिन से पड़ा है।", p.name + " " + p.age + " ದಿನಗಳಿಂದ ಇದೆ.");
    if (w.speed) say3(p.name + " sells about " + p.vel + " a day.", p.name + " रोज़ लगभग " + p.vel + " बिकता है।", p.name + " ದಿನಕ್ಕೆ ಸುಮಾರು " + p.vel + ".");
    if (w.cover) say3(p.name + " will last about " + Math.round(p.days || 0) + " days.", p.name + " लगभग " + Math.round(p.days || 0) + " दिन चलेगा।", p.name + " ಸುಮಾರು " + Math.round(p.days || 0) + " ದಿನ ಸಾಕು.");
    if (w.clearance) {
      var pct = Math.round((Number(p.clearance) || 0) * 100);
      say3(pct ? p.name + " is " + pct + " percent off." : p.name + " has no discount.", pct ? p.name + " पर " + pct + " प्रतिशत छूट है।" : p.name + " पर कोई छूट नहीं है।", pct ? p.name + " ಮೇಲೆ " + pct + " ಶೇಕಡಾ ರಿಯಾಯಿತಿ." : p.name + " ಮೇಲೆ ರಿಯಾಯಿತಿ ಇಲ್ಲ.");
    }
    if (w.lead) say3(p.name + " takes " + p.lead + " days to arrive.", p.name + " " + p.lead + " दिन में आता है।", p.name + " " + p.lead + " ದಿನದಲ್ಲಿ ಬರುತ್ತದೆ.");
    if (w.channel) {
      var key = /shopify/.test(w._q) ? "shopify" : /warehouse|गोदाम/.test(w._q) ? "warehouse" : "pos";
      var n = (p.channels && p.channels[key]) || 0;
      say3(p.name + " has " + n + " in " + key + ".", p.name + " के " + n + " " + key + " में हैं।", p.name + " " + key + " ನಲ್ಲಿ " + n + ".");
    }
    if (w.status) say3(p.name + " is " + (p.status === "reorder" ? "sold out. Status is reorder" : statusWord(p.status, "en")) + ".", p.name + " की स्थिति " + statusWord(p.status, "hi") + "।", p.name + " ಸ್ಥಿತಿ " + statusWord(p.status, "kn") + ".");
    if (w.margin) say3("Margin on " + p.name + " is " + Math.round((price - cost) / (price || 1) * 100) + " percent.", p.name + " का मार्जिन " + Math.round((price - cost) / (price || 1) * 100) + " प्रतिशत है।", p.name + " ಮಾರ್ಜಿನ್ " + Math.round((price - cost) / (price || 1) * 100) + " ಶೇಕಡಾ.");
    if (w.profit) say3(p.name + " profit is " + inr(Math.round(sold * (price - cost))) + ".", p.name + " का मुनाफा " + inr(Math.round(sold * (price - cost))) + " है।", p.name + " ಲಾಭ " + inr(Math.round(sold * (price - cost))) + ".");
    if (w.capital) say3(inr(p.value) + " is tied in " + p.name + ".", p.name + " में " + inr(p.value) + " फँसे हैं।", p.name + " ನಲ್ಲಿ " + inr(p.value) + " ಸಿಲುಕಿದೆ.");
    if (w.today) {
      if (!t.qty) say3("No " + p.name + " sold today.", p.name + " आज नहीं बिका।", p.name + " ಇವತ್ತು ಮಾರಾಟವಾಗಿಲ್ಲ.");
      else {
        if (w.sold || w.stock || !w.money) say3(t.qty + " " + p.name + " sold today.", p.name + " के आज " + t.qty + " पीस बिके।", p.name + " ಇವತ್ತು " + t.qty + " ಮಾರಾಟ.");
        if (w.money) say3(p.name + " sales today are " + inr(t.money) + ".", p.name + " की आज की बिक्री " + inr(t.money) + " है।", p.name + " ಇವತ್ತಿನ ಮಾರಾಟ " + inr(t.money) + ".");
      }
    } else {
      if (w.sold) say3(p.name + " sold " + sold + " this month.", p.name + " इस महीने " + sold + " बिके।", p.name + " ಈ ತಿಂಗಳು " + sold + " ಮಾರಾಟ.");
      if (w.money) say3(p.name + " sales are " + inr(Math.round(sold * price)) + ".", p.name + " की बिक्री " + inr(Math.round(sold * price)) + " है।", p.name + " ಮಾರಾಟ " + inr(Math.round(sold * price)) + ".");
      if ((w.stock && !w.channel) || !bits.length) say3(p.name + " has " + p.units + " left.", p.name + " के " + p.units + " पीस बचे हैं।", p.name + " ನಲ್ಲಿ " + p.units + " ಉಳಿದಿವೆ.");
    }
    return bits.join(" ");
  }

  function reply(question, book, selected) {
    var q = String(question || "").trim();
    var lang = pickLang(q, selected);
    var skus = (book && book.skus) || [];
    var s = q.toLowerCase();
    var w = flags(s);
    w._q = s;
    var hits = findHits(s, skus);
    var slow = skus.filter(function (p) { return p.status === "dead" || p.status === "risk"; });
    var gone = skus.filter(function (p) { return p.status === "reorder" || p.status === "out"; });
    var low = skus.filter(function (p) { return p.status === "low" || p.status === "critical"; });
    var text;

    if (!q) text = say(lang, "empty");
    else if (/^(hello|hi|hey|namaste|नमस्ते|ನಮಸ್ಕಾರ)\b/.test(s)) text = say(lang, "greet");
    else if (/help|what can you|क्या पूछ|ಏನು ಕೇಳ|madad|सहायता/.test(s)) text = say(lang, "help");
    else if (!hits.length && /sales down|slow|धीमी|ನಿಧಾನ|dead stock/.test(s)) text = slow.length ? nameOnly(lang, "slow", slow) : say(lang, "noneSlow");
    else if (!hits.length && /sold out|out of stock|खत्म हो|ಮುಗಿದ/.test(s)) text = gone.length ? nameOnly(lang, "out", gone) : say(lang, "noneOut");
    else if (!hits.length && /reorder|low stock|कम स्टॉक|ಮರು ಆರ್ಡರ್/.test(s)) text = lowLine(lang, low);
    else if (!hits.length && /fastest|तेज बिक|सबसे तेज|ಅತಿ ವೇಗ|best sell|top sell/.test(s)) text = fastLine(lang, skus);
    else if (hits.length) text = hits.map(function (p) { return describe(lang, p, w, book); }).join(" ");
    else if (w.channel) {
      var key = /shopify/.test(s) ? "shopify" : /warehouse|गोदाम/.test(s) ? "warehouse" : "pos";
      var n = skus.reduce(function (a, p) { return a + ((p.channels && p.channels[key]) || 0); }, 0);
      text = lang === "hi" ? (key + " में " + n + " पीस हैं।") : lang === "kn" ? (key + " ನಲ್ಲಿ " + n + ".") : (key + " has " + n + " units.");
    } else if (w.today) text = todayLine(lang, book, s);
    else if (w.profit) text = moneyLine(lang, "profit", book);
    else if (w.capital) text = moneyLine(lang, "capital", book);
    else if (w.money) text = moneyLine(lang, "sales", book);
    else if (w.stock) text = moneyLine(lang, "inventory", book);
    else if (/how many (products|skus|items)|कितने प्रोडक्ट|ಎಷ್ಟು ವಸ್ತು/.test(s)) text = lang === "hi" ? (skus.length + " प्रोडक्ट हैं।") : lang === "kn" ? (skus.length + " ವಸ್ತುಗಳಿವೆ.") : ("There are " + skus.length + " products.");
    else text = say(lang, "fallback");

    return { text: text, lang: lang };
  }

  function say(lang, key) {
    var line = {
      en: {
        empty: "Ask about stock, sales, profit, or what is selling slowly.",
        greet: "Hello. I am Mercura. Ask me in English, Hindi, or Kannada about this shop.",
        help: "You can ask: how many jackets are left, what is sales down, what sold today, or what is the profit.",
        noneOut: "Nothing is sold out right now.",
        noneLow: "Nothing is low on stock right now.",
        noneSlow: "Nothing is selling slowly right now.",
        fallback: "I answer from this shop's stock, sales, profit, and slow items. Try: how many jackets are left, or what is sales down?"
      },
      hi: {
        empty: "स्टॉक, बिक्री, मुनाफा, या धीमी चीज़ों के बारे में पूछें।",
        greet: "नमस्ते। मैं Mercura हूँ। इस दुकान के बारे में हिंदी, अंग्रेज़ी, या कन्नड़ में पूछें।",
        help: "आप पूछ सकते हैं: जैकेट कितने बचे हैं, बिक्री किसकी धीमी है, आज क्या बिका, या मुनाफा कितना है।",
        noneOut: "अभी कुछ भी खत्म नहीं हुआ है।",
        noneLow: "अभी किसी चीज़ का स्टॉक कम नहीं है।",
        noneSlow: "अभी कोई धीमी चीज़ नहीं है।",
        fallback: "मैं इस दुकान के स्टॉक, बिक्री, मुनाफे और धीमी चीज़ों के बारे में बताता हूँ। पूछें: जैकेट कितने बचे हैं?"
      },
      kn: {
        empty: "ಸ್ಟಾಕ್, ಮಾರಾಟ, ಲಾಭ, ಅಥವಾ ನಿಧಾನ ವಸ್ತುಗಳ ಬಗ್ಗೆ ಕೇಳಿ.",
        greet: "ನಮಸ್ಕಾರ. ನಾನು Mercura. ಈ ಅಂಗಡಿಯ ಬಗ್ಗೆ ಕನ್ನಡ, ಹಿಂದಿ, ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಕೇಳಿ.",
        help: "ನೀವು ಕೇಳಬಹುದು: ಜಾಕೆಟ್ ಎಷ್ಟು ಉಳಿದಿದೆ, ಯಾವುದರ ಮಾರಾಟ ನಿಧಾನ, ಇವತ್ತು ಏನು ಮಾರಾಟವಾಯಿತು, ಅಥವಾ ಲಾಭ ಎಷ್ಟು.",
        noneOut: "ಈಗ ಏನೂ ಖಾಲಿಯಾಗಿಲ್ಲ.",
        noneLow: "ಈಗ ಯಾವುದರ ಸ್ಟಾಕ್ ಕಡಿಮೆ ಇಲ್ಲ.",
        noneSlow: "ಈಗ ನಿಧಾನ ವಸ್ತುಗಳಿಲ್ಲ.",
        fallback: "ನಾನು ಈ ಅಂಗಡಿಯ ಸ್ಟಾಕ್, ಮಾರಾಟ, ಲಾಭ ಮತ್ತು ನಿಧಾನ ವಸ್ತುಗಳ ಬಗ್ಗೆ ಹೇಳುತ್ತೇನೆ. ಕೇಳಿ: ಜಾಕೆಟ್ ಎಷ್ಟು ಉಳಿದಿದೆ?"
      }
    };
    return line[lang][key];
  }

  function wantsMoney(s) {
    return flags(s).money;
  }

  function moneyLine(lang, kind, book) {
    var n = inr(kind === "profit" ? book.profit : kind === "capital" ? book.capital : kind === "inventory" ? book.inventory : book.sales);
    if (lang === "hi") {
      if (kind === "profit") return "इस महीने का मुनाफा " + n + " है।";
      if (kind === "capital") return "जोखिम में पूँजी " + n + " है।";
      if (kind === "inventory") return "स्टॉक में " + n + " की पूँजी फँसी है।";
      return "इस महीने की बिक्री " + n + " है।";
    }
    if (lang === "kn") {
      if (kind === "profit") return "ಈ ತಿಂಗಳ ಲಾಭ " + n + ".";
      if (kind === "capital") return "ಅಪಾಯದಲ್ಲಿರುವ ಹಣ " + n + ".";
      if (kind === "inventory") return "ಸ್ಟಾಕ್‌ನಲ್ಲಿ " + n + " ಇದೆ.";
      return "ಈ ತಿಂಗಳ ಮಾರಾಟ " + n + ".";
    }
    if (kind === "profit") return "Profit this month is " + n + ".";
    if (kind === "capital") return "Capital at risk is " + n + ".";
    if (kind === "inventory") return "Inventory on hand is worth " + n + ".";
    return "Sales this month are " + n + ".";
  }

  function nameOnly(lang, kind, list) {
    var who = names(list);
    if (lang === "hi") return kind === "out" ? ("बिक चुके हैं: " + who + "।") : ("बिक्री धीमी है: " + who + "।");
    if (lang === "kn") return kind === "out" ? ("ಮಾರಾಟವಾಗಿದೆ: " + who + ".") : ("ಮಾರಾಟ ನಿಧಾನ: " + who + ".");
    return kind === "out" ? ("Sold out: " + who + ".") : ("Sales are down on " + who + ".");
  }

  function lowLine(lang, low) {
    if (!low.length) return say(lang, "noneLow");
    if (lang === "hi") return "स्टॉक कम है: " + names(low) + "।";
    if (lang === "kn") return "ಸ್ಟಾಕ್ ಕಡಿಮೆ: " + names(low) + ".";
    return "Low stock: " + names(low) + ".";
  }

  function fastLine(lang, skus) {
    var top = skus.slice().sort(function (a, b) { return b.vel - a.vel; })[0];
    if (!top) return say(lang, "fallback");
    if (lang === "hi") return "सबसे तेज़ " + top.name + " है, लगभग " + top.vel + " पीस रोज़।";
    if (lang === "kn") return "ಅತಿ ವೇಗವಾಗಿ " + top.name + ", ದಿನಕ್ಕೆ ಸುಮಾರು " + top.vel + ".";
    return "Fastest right now is " + top.name + ", about " + top.vel + " a day.";
  }

  function todayLine(lang, book, s) {
    var qty = book.todayQty || 0;
    var money = wantsMoney(s) || /कमाई|much/.test(s);
    var count = /how many|kitn|ಎಷ್ಟು|eshtu|units|पीस/.test(s);
    if (!qty) {
      if (lang === "hi") return "आज अभी कोई बिक्री दर्ज नहीं है।";
      if (lang === "kn") return "ಇವತ್ತು ಇನ್ನೂ ಮಾರಾಟ ದಾಖಲಾಗಿಲ್ಲ.";
      return "No sales logged today yet.";
    }
    if (money) {
      if (lang === "hi") return "आज की बिक्री " + inr(book.todayRevenue || 0) + " है।";
      if (lang === "kn") return "ಇವತ್ತಿನ ಮಾರಾಟ " + inr(book.todayRevenue || 0) + ".";
      return "Sales today are " + inr(book.todayRevenue || 0) + ".";
    }
    if (count) {
      if (lang === "hi") return "आज " + qty + " पीस बिके।";
      if (lang === "kn") return "ಇವತ್ತು " + qty + " ಮಾರಾಟ.";
      return qty + " units sold today.";
    }
    var bits = (book.today || []).map(function (row) { return row.qty + " " + row.name; }).join(", ");
    if (lang === "hi") return "आज बिका: " + bits + "।";
    if (lang === "kn") return "ಇವತ್ತು ಮಾರಾಟ: " + bits + ".";
    return "Sold today: " + bits + ".";
  }

  function romanHindi(text) {
    var cons = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "f", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ड़": "r", "ढ़": "rh", "ज़": "z", "फ़": "f" };
    var matra = { "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri" };
    var indep = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri" };
    var chars = Array.from(String(text || "").replace(/₹\s*/g, " रुपये "));
    var out = "";
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var next = chars[i + 1] || "";
      if (cons[c]) {
        if (next === "्") { out += cons[c]; i++; continue; }
        if (matra[next]) { out += cons[c] + matra[next]; i++; continue; }
        if (next === "ं" || next === "ँ") { out += cons[c] + "an"; i++; continue; }
        out += cons[c] + "a";
        continue;
      }
      if (c === "ं" || c === "ँ") { out += "n"; continue; }
      if (c === "ः") { out += "h"; continue; }
      if (indep[c]) { out += indep[c]; continue; }
      if (c === "।" || c === "॥") { out += ". "; continue; }
      if (matra[c] || c === "्") continue;
      out += c;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function spokenText(text, lang) {
    var s = String(text || "");
    s = s.replace(/₹\s*/g, lang === "kn" ? " ರೂಪಾಯಿ " : lang === "hi" ? " रुपये " : " rupees ");
    s = s.replace(/(\d),(?=\d)/g, "$1");
    s = s.replace(/[,\.!\?;:|"'`~()\[\]{}<>।॥…—–]/g, " ");
    return s.replace(/\s+/g, " ").trim();
  }

  var speakToken = 0;
  var clip = null;

  function speak(text, lang) {
    if (typeof window === "undefined") return;
    var token = ++speakToken;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (clip) { clip.pause(); clip = null; }
    var spoken = spokenText(text, lang);
    if (!spoken) return;
    if (lang === "hi" || lang === "kn") sayCloud(spoken, lang === "kn" ? "kn" : "hi", token);
    else sayLocal(spoken, "en-IN", "en", token);
  }

  function sayCloud(spoken, tl, token) {
    var parts = [];
    var rest = spoken;
    while (rest.length > 160) {
      var cut = rest.lastIndexOf(" ", 160);
      if (cut < 20) cut = 160;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    var i = 0;
    var failed = false;
    function next() {
      if (token !== speakToken || failed || i >= parts.length) return;
      var url = "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=" + tl + "&q=" + encodeURIComponent(parts[i]);
      i += 1;
      clip = new Audio(url);
      clip.onended = next;
      clip.onerror = function () {
        if (failed || token !== speakToken || i > 1) return;
        failed = true;
        sayLocal(spoken, tl === "kn" ? "kn-IN" : "hi-IN", tl, token);
      };
      var playing = clip.play();
      if (playing && playing.catch) playing.catch(function () {
        if (failed || token !== speakToken || i > 1) return;
        failed = true;
        sayLocal(spoken, tl === "kn" ? "kn-IN" : "hi-IN", tl, token);
      });
    }
    next();
  }

  function sayLocal(spoken, code, lang, token) {
    if (!window.speechSynthesis || token !== speakToken) return;
    var list = window.speechSynthesis.getVoices() || [];
    var voice = list.filter(function (v) {
      return (v.lang || "").toLowerCase().replace("_", "-").indexOf(code.slice(0, 2)) === 0;
    })[0];
    var line = (!voice && lang === "hi") ? spokenText(romanHindi(spoken), "en") : spoken;
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(line);
    utter.lang = voice ? code : "en-IN";
    if (voice) utter.voice = voice;
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  }

  var api = { reply: reply, pickLang: pickLang, speak: speak, romanHindi: romanHindi, spokenText: spokenText };

  function mount() {
    if (document.getElementById("copilot-panel")) return;
    var box = document.createElement("div");
    box.innerHTML = ''
      + '<button type="button" id="copilot-open" style="position:fixed;bottom:20px;right:20px;z-index:80;display:flex;align-items:center;gap:8px;background:#D4AF37;color:#0B1F2A;border:0;border-radius:999px;padding:12px 16px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer">Copilot</button>'
      + '<aside id="copilot-panel" style="display:none;position:fixed;bottom:20px;right:20px;z-index:80;width:min(100vw - 2rem,24rem);height:min(70vh,32rem);flex-direction:column;background:#F8FAFC;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.28);overflow:hidden">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;padding:12px 16px;background:#0B1F2A;color:#fff"><div><b>Mercura Copilot</b><div style="font-size:11px;color:#cbd5e1">Hindi, Kannada, or English</div></div>'
      + '<div style="display:flex;gap:8px;align-items:center"><select id="copilot-lang" aria-label="Answer language" style="background:#123044;color:#fff;border:1px solid #345;border-radius:8px;padding:4px"><option value="en">English</option><option value="hi">हिंदी</option><option value="kn">ಕನ್ನಡ</option></select>'
      + '<button type="button" id="copilot-close" style="background:transparent;color:#fff;border:0;cursor:pointer">Close</button></div></div>'
      + '<div id="copilot-log" style="flex:1;overflow:auto;padding:12px" aria-live="polite"></div>'
      + '<form id="copilot-form" style="display:flex;gap:8px;padding:12px;background:#fff;border-top:1px solid #e2e8f0">'
      + '<button type="button" id="copilot-mic" style="width:40px;border:0;border-radius:999px;background:#E6F7F5;cursor:pointer">Mic</button>'
      + '<input id="copilot-input" style="flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:8px" placeholder="Ask in Hindi, Kannada, or English" autocomplete="off">'
      + '<button type="submit" style="background:#D4AF37;border:0;border-radius:12px;padding:8px 12px;font-weight:700;cursor:pointer">Send</button></form></aside>';
    while (box.firstChild) document.body.appendChild(box.firstChild);
  }

  function boot() {
    if (typeof document === "undefined" || !document.body) return;
    mount();
    var panel = document.getElementById("copilot-panel");
    var log = document.getElementById("copilot-log");
    var input = document.getElementById("copilot-input");
    var langSel = document.getElementById("copilot-lang");
    var mic = document.getElementById("copilot-mic");
    if (!panel || !log || !input) return;
    var greeted = false;
    var rec = null;

    function add(role, text) {
      var row = document.createElement("div");
      row.className = role === "you" ? "ml-8 rounded-2xl bg-[#0B1F2A] text-white px-3 py-2 text-sm" : "mr-8 rounded-2xl bg-white border border-slate-200 text-[#1F2937] px-3 py-2 text-sm";
      row.textContent = text;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    function ask(raw) {
      var q = String(raw || input.value || "").trim();
      if (!q) return;
      input.value = "";
      add("you", q);
      var selected = langSel ? langSel.value : "en";
      var answer = reply(q, shopBook(), selected);
      if (langSel) langSel.value = answer.lang;
      add("bot", answer.text);
      speak(answer.text, answer.lang);
    }

    function shopBook() {
      var M = window.Mercura;
      if (!M) return { skus: [], sales: 0, profit: 0, inventory: 0, capital: 0, deadCapital: 0, todayQty: 0, todayRevenue: 0, today: [] };
      var store = window.MercuraStore;
      var skus, today;
      if (store) {
        skus = M.catalog(store.engineActions());
        today = store.salesToday ? store.salesToday() : [];
      } else {
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem("mercura_store_v3") || "{}"); } catch (e) {}
        skus = M.catalog({
          clearance: saved.clearance || {},
          added: saved.added || [],
          locked: {}, reviewed: {}, snooze: {}, dismissed: {}, accepted: {}, log: []
        });
        var start = new Date();
        start.setHours(0, 0, 0, 0);
        today = (saved.salesHistory || []).filter(function (s) { return s.timestamp >= start.getTime(); });
      }
      var k = M.kpis(skus, "all");
      return {
        skus: skus,
        sales: k.sales,
        profit: k.profit,
        inventory: k.inventoryValue,
        capital: k.capital,
        deadCapital: k.deadCapital,
        todayQty: today.reduce(function (a, s) { return a + s.qty; }, 0),
        todayRevenue: today.reduce(function (a, s) { return a + s.revenue; }, 0),
        today: today
      };
    }

    document.body.appendChild(panel);
    if (document.getElementById("copilot-open")) document.body.appendChild(document.getElementById("copilot-open"));
    var launcher = document.getElementById("copilot-open");
    var closer = document.getElementById("copilot-close");
    function show(el, display) {
      if (!el) return;
      el.classList.remove("hidden");
      el.style.display = display;
      el.style.position = "fixed";
      el.style.zIndex = "80";
      el.style.bottom = "20px";
      el.style.right = "20px";
    }
    function hide(el) {
      if (!el) return;
      el.classList.add("hidden");
      el.style.display = "none";
    }
    api.open = function () {
      show(panel, "flex");
      hide(launcher);
      if (!greeted) {
        greeted = true;
        add("bot", say(langSel ? langSel.value : "en", "greet"));
      }
      input.focus();
    };
    api.close = function () {
      hide(panel);
      show(launcher, "flex");
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (rec) { try { rec.stop(); } catch (e) {} }
    };
    api.ask = ask;
    if (closer) closer.addEventListener("click", function () { api.close(); });

    var form = document.getElementById("copilot-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      ask();
    });

    if (mic) mic.addEventListener("click", function () {
      var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) {
        add("bot", langSel && langSel.value === "hi" ? "इस ब्राउज़र में आवाज़ नहीं चलती। टाइप करें।" : langSel && langSel.value === "kn" ? "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಇಲ್ಲ. ಟೈಪ್ ಮಾಡಿ." : "This browser has no voice input. Type the question.");
        return;
      }
      if (rec) { try { rec.stop(); } catch (e) {} rec = null; mic.textContent = "mic"; return; }
      rec = new Ctor();
      var selected = langSel ? langSel.value : "en";
      rec.lang = selected === "hi" ? "hi-IN" : selected === "kn" ? "kn-IN" : "en-IN";
      rec.interimResults = false;
      rec.onresult = function (event) {
        var heard = event.results[0][0].transcript;
        mic.textContent = "mic";
        rec = null;
        ask(heard);
      };
      rec.onerror = function () {
        mic.textContent = "mic";
        rec = null;
        add("bot", "I could not hear that. Try again, or type it.");
      };
      rec.onend = function () { mic.textContent = "mic"; rec = null; };
      mic.textContent = "stop";
      try { rec.start(); } catch (e) {
        mic.textContent = "mic";
        rec = null;
        add("bot", "Allow the microphone, or type the question.");
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  return api;
});
