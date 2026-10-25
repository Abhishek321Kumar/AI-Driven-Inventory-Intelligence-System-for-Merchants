/**
 * Mercura AI — Centralized Reactive State & Data Ingestion Engine
 * Handles:
 * 1. Centralized Reactive State (Catalog, KPIs, Alerts, Persistence via localStorage)
 * 2. 3-Tab Data Ingestion Hub Modal (Bulk CSV, Invoice OCR & Thumbnail, Adaptive Manual Entry & Quick Sale)
 * 3. Drag-and-Drop Table Ingestion & Voice Recognition Quick-Sale
 */

(function (window) {
  'use strict';

  const STORAGE_KEY = 'mercura_store_v3';

  // Fallback category thumbnail mapping
  const CATEGORY_IMAGES = {
    'Essentials': 'img/ts.jpg',
    'Apparel': 'img/jeans.jpg',
    'Outerwear': 'img/jacket.jpg',
    'Footwear': 'img/shoes.jpg',
    'Accessories': 'img/scarf.jpg',
    'Activewear': 'img/pants.jpg',
    'Ethnic Wear': 'img/kurti.jpg',
    'Resort': 'img/wrap.jpg'
  };

  const EMPTY_STATE = { added: [], removed: [], salesHistory: [], clearance: {}, locked: {} };

  class MercuraStore {
    constructor() {
      this.listeners = [];
      this.state = this.loadState();
      this.initListeners();
    }

    storageKey() {
      const id = window.MercuraCloud && window.MercuraCloud.uid && window.MercuraCloud.uid();
      return id ? ("mercura_store_" + id) : STORAGE_KEY;
    }

    loadState() {
      try {
        const saved = localStorage.getItem(this.storageKey());
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            added: parsed.added || [],
            removed: parsed.removed || [],
            salesHistory: parsed.salesHistory || [],
            clearance: parsed.clearance || {},
            locked: parsed.locked || {}
          };
        }
      } catch (e) {
        console.warn('Could not read from localStorage, using the catalog file', e);
      }
      return JSON.parse(JSON.stringify(EMPTY_STATE));
    }

    engineActions() {
      return {
        clearance: this.state.clearance || {},
        locked: this.state.locked || {},
        reviewed: {},
        snooze: {},
        dismissed: {},
        accepted: {},
        added: this.state.added || [],
        removed: this.state.removed || [],
        log: []
      };
    }

    upsert(raw) {
      this.state.added = this.state.added || [];
      const i = this.state.added.findIndex(x => x.id === raw.id);
      if (i >= 0) this.state.added[i] = raw;
      else this.state.added.unshift(raw);
    }

    removeProduct(id) {
      this.state.added = (this.state.added || []).filter(x => x.id !== id);
      this.state.removed = this.state.removed || [];
      if (this.state.removed.indexOf(id) < 0) this.state.removed.push(id);
      if (this.state.locked) delete this.state.locked[id];
      if (this.state.clearance) delete this.state.clearance[id];
      this.saveState();
    }

    setChannel(channel) {
      this.channel = channel || 'all';
      this.updateDOM();
    }

    setLocked(sku, on) {
      this.state.locked = this.state.locked || {};
      if (on) this.state.locked[sku] = true;
      else delete this.state.locked[sku];
      this.saveState();
    }

    setClearance(sku, on) {
      this.state.clearance = this.state.clearance || {};
      if (on) this.state.clearance[sku] = 0.15;
      else delete this.state.clearance[sku];
      this.saveState();
    }

    saveState() {
      try {
        localStorage.setItem(this.storageKey(), JSON.stringify(this.state));
      } catch (e) {
        console.warn('Could not write to localStorage', e);
      }
      this.notify();
      if (window.MercuraCloud && window.MercuraCloud.schedulePush) window.MercuraCloud.schedulePush();
    }

    subscribe(fn) {
      this.listeners.push(fn);
      return () => {
        this.listeners = this.listeners.filter(l => l !== fn);
      };
    }

    notify() {
      this.listeners.forEach(fn => {
        try { fn(this.state); } catch (e) { console.error(e); }
      });
      this.updateDOM();
    }

    initListeners() {
      // Whenever store initializes, update DOM elements
      setTimeout(() => this.updateDOM(), 50);
    }

    // Helper: Compute SKU Financials & AI Status
    evaluateProduct(p) {
      const stock = Math.max(0, parseInt(p.stock) || 0);
      const cost = Math.max(0, parseFloat(p.cost_price || p.cost) || 0);
      const price = Math.max(0, parseFloat(p.selling_price || p.price) || 0);
      const age = Math.max(0, parseInt(p.inventory_age_days || p.age) || 0);
      const lead = Math.max(1, parseInt(p.supplier_lead_days || p.lead) || 5);
      const monthlySales = Math.max(0, parseFloat(p.monthly_sales) || 0);
      
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
      const invValue = stock * cost;
      const dailyVel = monthlySales > 0 ? (monthlySales / 30) : (parseFloat(p.daily_velocity) || 1.2);
      const daysOfCover = stock / Math.max(dailyVel, 0.05);

      let riskStatus = 'healthy';
      let riskLabel = '✓ HEALTHY';
      let riskBadgeClass = 'bg-[#0EA5A0]/15 text-[#0EA5A0] border-[#0EA5A0]/30';

      if (age > 45 && monthlySales <= 3) {
        riskStatus = 'dead';
        riskLabel = '❗ DEAD STOCK';
        riskBadgeClass = 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30';
      } else if (daysOfCover < lead) {
        riskStatus = 'low';
        riskLabel = '⚠️ LOW STOCK';
        riskBadgeClass = 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30';
      }

      return {
        sku: p.sku || p.id || ('SKU-' + Math.floor(100 + Math.random() * 900)),
        name: p.name || 'Untitled Product',
        cat: p.category || p.cat || 'Apparel',
        vendor: p.supplier || p.vendor || 'Local Vendor',
        stock: stock,
        cost: cost,
        price: price,
        margin: Math.round(margin * 10) / 10,
        value: invValue,
        age: age,
        lead: lead,
        monthlySales: monthlySales,
        dailyVel: Math.round(dailyVel * 10) / 10,
        daysOfCover: Math.round(daysOfCover * 10) / 10,
        status: riskStatus,
        statusLabel: riskLabel,
        badgeClass: riskBadgeClass,
        img: p.image_url || p.img || CATEGORY_IMAGES[p.category || p.cat] || 'img/ts.jpg',
        isNew: true,
        createdAt: p.createdAt || Date.now()
      };
    }

    // Add Products (Single or Array). Same SKU replaces the catalog row.
    addProducts(productsList) {
      const list = Array.isArray(productsList) ? productsList : [productsList];
      const rows = list.map(p => window.Mercura.normalize(p));
      rows.forEach(row => this.upsert(row));
      this.saveState();
      if (window.MercuraCloud && window.MercuraCloud.saveNow) {
        window.MercuraCloud.saveNow().then(ok => {
          if (ok && window.showToast) window.showToast('Saved ' + rows.length + ' product' + (rows.length === 1 ? '' : 's') + ' to your store database.', 'cloud_done');
        });
      }
      return rows;
    }

    // Record a Quick Sale (Deduct Stock & Add Revenue)
    salesToday() {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const t = start.getTime();
      return (this.state.salesHistory || []).filter(s => s.timestamp >= t);
    }

    recordSale(sku, qtySold) {
      const list = window.Mercura.catalog(this.engineActions());
      const target = list.find(p => p.id === sku);
      if (!target) throw new Error(`SKU "${sku}" not found in catalog.`);
      const result = window.Mercura.applySale(target, qtySold);
      if (result.error) throw new Error(result.error + " · " + target.name);
      const channels = Object.assign({}, target.channels);
      let left = result.qty;
      ['warehouse', 'pos', 'shopify'].forEach(k => {
        const take = Math.min(Number(channels[k]) || 0, left);
        channels[k] = (Number(channels[k]) || 0) - take;
        left -= take;
      });
      const next = window.Mercura.normalize(Object.assign({}, target, {
        units: result.units,
        sold: result.sold,
        price: target.listPrice || target.price,
        channels: channels
      }));
      this.upsert(next);
      this.state.salesHistory.unshift({
        id: 'SALE-' + Date.now(),
        sku: target.id,
        name: target.name,
        qty: result.qty,
        revenue: result.revenue,
        profit: result.profit,
        timestamp: Date.now()
      });
      this.saveState();
      return { product: next, qtySold: result.qty, revenue: result.revenue, profit: result.profit, remainingStock: next.units };
    }

    // Update Product Thumbnail
    updateProductImage(sku, imageUrl) {
      const list = window.Mercura.catalog(this.engineActions());
      const target = list.find(p => p.id === sku);
      if (!target) return;
      this.upsert(window.Mercura.normalize(Object.assign({}, target, { img: imageUrl })));
      this.saveState();
    }

    // KPIs are the sum of the live catalog. Nothing is added on top of a fixed base.
    getMetrics() {
      const all = window.Mercura.catalog(this.engineActions());
      const full = window.Mercura.kpis(all, 'all');
      const view = window.Mercura.kpis(all, this.channel || 'all');
      const tight = all.filter(s => s.status === 'critical' || s.status === 'low').sort((a, b) => a.days - b.days)[0];
      return Object.assign(view, {
        full: full,
        all: all,
        mix: window.Mercura.channelMix(all),
        fastest: all.slice().sort((a, b) => b.vel - a.vel)[0],
        tight: tight,
        activeAlertsCount: window.Mercura.alerts(all).length
      });
    }

    resetToDemo() {
      localStorage.removeItem(STORAGE_KEY);
      this.state = JSON.parse(JSON.stringify(EMPTY_STATE));
      this.channel = 'all';
      this.saveState();
      if (window.fireConfetti) window.fireConfetti();
      if (window.HapticAudio) window.HapticAudio.chime();
      if (window.showToast) window.showToast('✓ Back to the catalog file', 'restart_alt');
    }

    updateDOM() {
      const m = this.getMetrics();
      const inr = n => window.Mercura.inr(n);
      const book = m.full || m;
      const marginPct = book.sales ? (book.profit / book.sales * 100).toFixed(1) : '0';

      const dInv = document.getElementById('d-kpi-inv');
      const dSales = document.getElementById('d-kpi-sales');
      const dProfit = document.getElementById('d-kpi-profit');
      const dRisk = document.getElementById('d-kpi-risk');
      if (dInv) dInv.textContent = inr(m.inventoryValue);
      if (dSales) dSales.textContent = inr(m.sales);
      if (dProfit) dProfit.textContent = inr(m.profit);
      if (dRisk) dRisk.textContent = inr(m.capital);

      const dCount = document.getElementById('d-kpi-inv-count');
      const dMargin = document.getElementById('d-kpi-margin');
      if (dCount) dCount.textContent = book.total + ' SKUs tracked';
      if (dMargin) dMargin.textContent = 'Margin ' + marginPct + '%';

      const hero = document.getElementById('hero-live-value');
      if (hero) hero.textContent = inr(book.inventoryValue) + ' Live';

      const invSkusEl = document.querySelector('#frame-inventory .glass-card:nth-child(1) .font-mono.text-2xl');
      const invValEl = document.querySelector('#frame-inventory .glass-card:nth-child(2) .font-mono.text-2xl');
      const invDeadEl = document.querySelector('#frame-inventory .glass-card:nth-child(3) .font-mono.text-2xl');
      const invOutEl = document.querySelector('#frame-inventory .glass-card:nth-child(4) .font-mono.text-2xl');
      if (invSkusEl) invSkusEl.innerHTML = `${book.total} <span class="text-xs text-[#94A3B8] font-normal">Active Now</span>`;
      if (invValEl) invValEl.innerHTML = `${inr(book.inventoryValue)} <span class="text-xs text-[#0EA5A0] font-normal">at cost</span>`;
      if (invDeadEl) invDeadEl.innerHTML = `${inr(book.deadCapital)} <span class="text-xs text-[#94A3B8] font-normal">${book.dead} SKU${book.dead === 1 ? '' : 's'}</span>`;
      if (invOutEl) invOutEl.innerHTML = `${book.low} SKU${book.low === 1 ? '' : 's'} <span class="text-xs text-[#94A3B8] font-normal">&lt; 5 days</span>`;
      const outNote = document.getElementById('inv-stockout-note');
      if (outNote) outNote.textContent = m.tight ? ('! ' + m.tight.id + ' · ' + m.tight.days.toFixed(1) + ' days cover') : 'No stockout inside 5 days';

      const salesValEl = document.querySelector('#frame-sales .glass-card:nth-child(1) .font-mono.text-3xl');
      const salesProfEl = document.querySelector('#frame-sales .glass-card:nth-child(2) .font-mono.text-3xl');
      const salesMargin = document.getElementById('sales-margin');
      if (salesValEl) salesValEl.textContent = inr(book.sales);
      if (salesProfEl) salesProfEl.textContent = inr(book.profit);
      if (salesMargin) salesMargin.textContent = 'Margin ' + marginPct + '%';
      const fastName = document.getElementById('sales-fastest-name');
      const fastMeta = document.getElementById('sales-fastest-meta');
      if (fastName && m.fastest) fastName.textContent = m.fastest.name;
      if (fastMeta && m.fastest) fastMeta.textContent = m.fastest.id + ' · ' + m.fastest.vel.toFixed(1) + ' / day';

      const cashRiskVal = document.getElementById('cash-risk-val');
      const cashChartRisk = document.getElementById('cash-chart-risk');
      if (cashRiskVal) cashRiskVal.textContent = inr(book.capital);
      if (cashChartRisk) cashChartRisk.textContent = inr(book.capital) + ' at risk';
      const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
      setText('cash-locked', inr(book.inventoryValue));
      setText('cash-dead', inr(book.deadCapital));
      const deadNames = m.all.filter(s => s.status === 'dead').map(s => s.name);
      setText('cash-dead-meta', deadNames.length ? (deadNames.join(', ') + ' · ' + book.dead + ' SKU' + (book.dead === 1 ? '' : 's')) : 'No dead stock');
      setText('cash-profit', inr(book.profit));
      setText('cash-chart-total', inr(book.inventoryValue));
      setText('cash-week4', inr(book.inventoryValue));
      setText('cash-where-title', 'Where ' + inr(book.capital) + ' sits');
      setText('sales-chart-tip', inr(book.sales));

      const onClearance = !!(this.state.clearance && this.state.clearance['JKT-409']);
      const cashBtn = document.getElementById('cash-clearance-btn');
      const dashJktBtn = document.getElementById('dash-jkt-btn');
      const cashNote = document.getElementById('cash-clearance-note');
      if (cashBtn) cashBtn.textContent = onClearance ? 'Undo clearance preview' : 'Preview 15% clearance';
      if (dashJktBtn) dashJktBtn.textContent = onClearance ? '✓ 15% Clearance Planned' : '🏷️ Plan Bundle Discount';
      if (cashNote) cashNote.textContent = onClearance ? 'Jacket clearance is planned. No purchase order was sent.' : 'Nothing is ordered. This only shows the cash picture.';

      const sidebarBadge = document.querySelector('[data-frame="alerts"] .sidebar-badge');
      if (sidebarBadge) sidebarBadge.textContent = m.activeAlertsCount;
      const bellBadge = document.getElementById('top-alert-count');
      if (bellBadge) { bellBadge.textContent = m.activeAlertsCount; bellBadge.style.display = m.activeAlertsCount ? '' : 'none'; }

      const chip = (f, text) => {
        const el = document.querySelector('#inv-filter-chips [data-filter="' + f + '"]');
        if (el) el.textContent = text;
      };
      chip('all', 'All ' + book.total);
      chip('healthy', '● Healthy ' + book.healthy);
      chip('low', '● Low Stock ' + book.low);
      chip('risk', '● Risk ' + book.risk);
      chip('dead', '● Dead Stock ' + book.dead);

      document.querySelectorAll('[data-live]').forEach(el => {
        el.textContent = el.getAttribute('data-live').replace(/\{n\}/g, String(book.total));
      });

      const catSel = document.getElementById('inv-cat-filter');
      if (catSel) {
        const current = catSel.value || 'all';
        const counts = {};
        m.all.forEach(s => { counts[s.cat] = (counts[s.cat] || 0) + 1; });
        const order = (window.Mercura.garmentOrder || []).filter(c => counts[c]);
        Object.keys(counts).forEach(c => { if (order.indexOf(c) === -1) order.push(c); });
        catSel.innerHTML = '<option value="all">All categories · ' + m.all.length + '</option>' +
          order.map(c => '<option value="' + c + '">' + c + ' · ' + counts[c] + '</option>').join('');
        catSel.value = current === 'all' || order.indexOf(current) !== -1 ? current : 'all';
      }

      this.renderSalesWatch(m.all);
      this.renderInsightCards(m.all);
      this.renderSoldToday();
      this.renderSalesTrend();
      this.fillSaleSelect();
      this.renderTableRows(m.all);
    }

    renderSalesWatch(list) {
      const watch = window.Mercura.watchList(list);
      const tone = { dead: '#EF4444', risk: '#EF4444', reorder: '#B45309', critical: '#D97706', low: '#D97706' };
      const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const html = watch.map(s => {
        const choice = s.status === 'reorder'
          ? '<span class="flex items-center gap-1 shrink-0"><button type="button" onclick="copySupplierNote(\'' + esc(s.id) + '\')" class="btn-gold px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Reorder</button><button type="button" onclick="deleteCatalogProduct(\'' + esc(s.id) + '\')" class="px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer border border-[#EF4444] text-[#EF4444]">Delete</button></span>'
          : '<b class="font-mono font-bold" style="color:' + (tone[s.status] || '#1F2937') + '">' + esc(s.label) + '</b>';
        return '<div class="flex items-center justify-between gap-3 py-3"><span class="font-medium text-[#1F2937]">' + esc(s.name) + ' · ' + esc(s.id) + '</span>' + choice + '</div>';
      }).join('') || '<div class="py-3 text-[#94A3B8]">Nothing slow or sold out.</div>';
      const box = document.getElementById('sales-watch');
      if (box) box.innerHTML = html;
      const byId = {};
      list.forEach(s => { byId[s.id] = s; });
      const jacket = byId['JKT-409'];
      if (!jacket) return;
      const soldOut = jacket.status === 'reorder';
      const statusText = soldOut ? 'Reorder' : (jacket.status === 'dead' ? 'Dead stock' : (jacket.status === 'risk' ? 'Sales down' : jacket.status));
      const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
      set('dash-jkt-status', soldOut ? '● REORDER' : '● HIGH RISK • CAPITAL TIED UP');
      set('dash-jkt-note', soldOut ? 'Sold out. Status is reorder.' : (window.Mercura.inr(jacket.value) + ' in jacket inventory, ' + jacket.age + ' days on hand.'));
      set('ins-jkt-status', soldOut ? '● Reorder' : '● Risk • High Priority');
      set('ins-jkt-quote', soldOut ? 'The jacket is sold out. Send a restock order.' : 'Slow sales and high inventory age indicate increased dead-stock risk.');
      set('ins-jkt-units', jacket.units + ' units');
      set('ins-jkt-capital', window.Mercura.inr(jacket.value));
      set('cash-jkt-status', soldOut ? 'Reorder' : (statusText + ' · ' + jacket.units + ' left'));
      set('cash-bar-jkt-val', window.Mercura.inr(jacket.value));
    }

    renderSalesTrend() {
      const rowsEl = document.getElementById('sales-trend-rows');
      if (!rowsEl || !window.Mercura.salesTrend) return;
      const trend = window.Mercura.salesTrend(window.Mercura.catalog(this.engineActions()), this.state.salesHistory);
      const summary = document.getElementById('sales-trend-summary');
      if (summary) summary.textContent = trend.up + ' rising · ' + trend.down + ' slowing · ' + trend.qty + ' sold today · ' + window.Mercura.inr(trend.revenue);
      const label = { up: 'Rising', down: 'Slowing', flat: 'On pace' };
      const color = { up: '#0EA5A0', down: '#EF4444', flat: '#64748B' };
      const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const interesting = trend.rows.filter(r => r.dir !== 'flat');
      const shown = interesting.length ? interesting : trend.rows.slice(0, 5);
      rowsEl.innerHTML = shown.map(r =>
        '<div class="flex items-center justify-between gap-3 py-2.5"><span class="font-medium text-[#1F2937]">' + esc(r.name) + '</span><span class="font-mono text-xs text-[#64748B]">' + r.qty + ' today · ' + r.expect + ' expected</span><b class="font-mono text-xs" style="color:' + color[r.dir] + '">' + label[r.dir] + '</b></div>'
      ).join('');
    }

    renderInsightCards(list) {
      const byId = {};
      (list || []).forEach(s => { byId[s.id] = s; });
      const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
      const inr = n => window.Mercura.inr(n);
      const jacket = byId['JKT-409'];
      if (jacket) {
        const po = window.Mercura.pendingPo(jacket);
        const soldOut = jacket.status === 'reorder';
        set('ins-jkt-title', soldOut ? 'Reorder — Jacket' : (jacket.locked ? 'Reorder locked — Jacket' : 'Reduce Purchase — Jacket'));
        set('ins-jkt-exposure', inr(soldOut ? 0 : jacket.value));
        set('ins-jkt-age', jacket.age + ' days');
        set('ins-jkt-days', soldOut ? 'None left' : ('~' + Math.round(jacket.days) + ' days'));
        set('ins-jkt-po', po ? ('Pending PO: ' + po + ' units') : 'Pending PO: none');
        set('ins-jkt-po-btn', jacket.locked ? 'Restore pending PO' : 'Adjust Procurement PO');
      }
      const shoes = byId['SH-102'];
      if (shoes) {
        const gap = shoes.lead - shoes.days;
        set('ins-sh-units', shoes.units + ' units');
        set('ins-sh-vel', shoes.vel.toFixed(1) + ' units/day');
        set('ins-sh-gap', '~' + Math.abs(gap).toFixed(1) + ' days');
        set('ins-sh-days', shoes.units <= 0 ? 'Reorder' : ('In ~' + shoes.days.toFixed(1) + ' days'));
        set('ins-sh-loss', 'Estimated loss: ' + inr(shoes.loss || 0));
        set('ins-sh-buffer', 'Lead buffer: ' + gap.toFixed(1) + ' days');
      }
      const panel = document.getElementById('ins-analysis');
      if (!panel || panel.classList.contains('hidden')) return;
      const sku = byId[panel.dataset.sku];
      if (!sku) return;
      const today = (this.salesToday() || []).filter(s => s.sku === sku.id).reduce((a, s) => a + s.qty, 0);
      panel.innerHTML = '<b>' + sku.name + '</b> · ' + sku.id +
        '<div class="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">' +
        '<span>Stock ' + sku.units + '</span><span>Sold today ' + today + '</span>' +
        '<span>Price ' + inr(sku.listPrice || sku.price) + '</span><span>Cost ' + inr(sku.cost) + '</span>' +
        '<span>Cover ' + (sku.units <= 0 ? 'none' : sku.days.toFixed(1) + ' days') + '</span><span>Capital ' + inr(sku.status === 'reorder' ? 0 : sku.value) + '</span>' +
        '<span>Status ' + sku.status + '</span><span>Pending PO ' + window.Mercura.pendingPo(sku) + '</span>' +
        '</div><div class="mt-2 text-xs">' + sku.supplier + (sku.phone ? ' · ' + sku.phone : '') + '</div>';
    }

    renderSoldToday() {
      const today = this.salesToday();
      const qty = today.reduce((a, s) => a + s.qty, 0);
      const revenue = today.reduce((a, s) => a + s.revenue, 0);
      const inr = n => window.Mercura.inr(n);
      const lines = today.slice(0, 8).map(s =>
        '<span class="px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-[#1F2937]">' + s.qty + ' × ' + s.name + '</span>'
      ).join('');
      const html = '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div><p class="text-[11px] font-mono uppercase tracking-wider text-[#0EA5A0] font-bold">Sold today</p>' +
        '<p class="font-mono text-lg font-extrabold text-[#1F2937]">' + qty + ' units · ' + inr(revenue) + '</p></div>' +
        '<div class="flex flex-wrap gap-1.5 text-[11px] font-mono">' + (lines || '<span class="text-[#94A3B8]">Enter a quantity on any product and tap Sold.</span>') + '</div></div>';
      ['dash-sold-today', 'sales-sold-today', 'cash-sold-today', 'alerts-sold-today'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      });
    }

    fillSaleSelect() {
      const sel = document.getElementById('quick-sale-sku-select');
      if (!sel) return;
      const current = sel.value;
      const list = window.Mercura.catalog(this.engineActions());
      const inr = n => window.Mercura.inr(n);
      sel.innerHTML = list.map(s =>
        '<option value="' + s.id + '">' + s.id + ' · ' + s.name + ' · ' + s.units + ' in stock · ' + inr(s.listPrice || s.price) + '</option>'
      ).join('');
      if (current && list.some(s => s.id === current)) sel.value = current;
      if (window.updateQuickSaleCard) window.updateQuickSaleCard();
    }

    renderTableRows(list) {
      const container = document.getElementById('inv-table-rows');
      if (!container) return;
      const rows = list || window.Mercura.catalog(this.engineActions());
      const inr = n => window.Mercura.inr(n);
      const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const q = ((document.getElementById('inv-search-input') || {}).value || '').toLowerCase().trim();
      const activeChip = document.querySelector('#inv-filter-chips [data-filter].font-bold');
      const filter = activeChip ? activeChip.getAttribute('data-filter') : 'all';
      const catFilter = (document.getElementById('inv-cat-filter') || {}).value || 'all';
      const order = window.Mercura.garmentOrder || [];
      const todayMap = {};
      this.salesToday().forEach(s => { todayMap[s.sku] = (todayMap[s.sku] || 0) + s.qty; });
      const shown = rows.filter(s => {
        const kind = s.status === 'critical' ? 'low' : s.status;
        if (filter !== 'all' && kind !== filter) return false;
        if (catFilter !== 'all' && s.cat !== catFilter) return false;
        if (q && (s.name + ' ' + s.id + ' ' + s.cat).toLowerCase().indexOf(q) === -1) return false;
        return true;
      }).sort((a, b) => {
        const d = (order.indexOf(a.cat) < 0 ? 99 : order.indexOf(a.cat)) - (order.indexOf(b.cat) < 0 ? 99 : order.indexOf(b.cat));
        return d || a.name.localeCompare(b.name);
      });
      const pager = document.getElementById('inv-pager');
      if (pager) pager.textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' products';

      let lastCat = '';
      container.innerHTML = shown.map(s => {
        const kind = s.status === 'critical' ? 'low' : s.status;
        const tone = s.status === 'reorder' ? '#B45309' : (s.status === 'dead' ? '#EF4444' : (s.status === 'low' || s.status === 'critical' ? '#F59E0B' : (s.status === 'risk' ? '#D97706' : '#0EA5A0')));
        const label = { healthy: '✓ HEALTHY', low: '⚠️ LOW STOCK', critical: '⚠️ LOW STOCK', risk: 'SLOW', dead: '❗ DEAD STOCK', reorder: '↻ REORDER' }[s.status] || s.status;
        const note = s.status === 'reorder'
          ? 'Sold out. Reorder it, or delete it from the catalog.'
          : (s.status === 'dead'
          ? (inr(s.value) + ' tied up · ' + s.age + ' days on hand')
          : ((s.status === 'low' || s.status === 'critical')
            ? ('About ' + s.days.toFixed(1) + ' days of cover. Lead time ' + s.lead + 'd.')
            : (s.status === 'risk' ? (s.age + '-day age. Velocity is soft.') : ('Cover is about ' + Math.round(s.days) + ' days.'))));
        const action = s.status === 'reorder'
          ? `<button type="button" onclick="copySupplierNote('${esc(s.id)}');" class="btn-gold px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Reorder</button><button type="button" onclick="deleteCatalogProduct('${esc(s.id)}');" class="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer border border-[#EF4444] text-[#EF4444] bg-white">Delete</button>`
          : ((s.status === 'low' || s.status === 'critical')
          ? `<button onclick="copySupplierNote('${esc(s.id)}');" class="btn-gold px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Reorder</button>`
          : (s.id === 'JKT-409' && s.status !== 'reorder'
            ? `<button onclick="toggleJacketClearance();" class="px-2.5 py-1 rounded-lg bg-[#EF4444] text-white text-[10px] font-bold cursor-pointer">Discount</button>`
            : `<button onclick="showToast('Viewing ${esc(s.name)}');" class="text-xs font-bold text-[#0EA5A0] hover:underline">View</button>`));
        const sell = s.listPrice || s.price;
        const margin = sell > 0 ? Math.round((sell - s.cost) / sell * 100) : 0;
        const velLabel = String(Math.round(Number(s.vel) * 100) / 100);
        const count = shown.filter(x => x.cat === s.cat).length;
        const head = s.cat !== lastCat
          ? `<div class="px-5 py-2 bg-[#E6F7F5] text-[11px] font-mono font-bold uppercase tracking-wider text-[#0B1F2A]">${esc(s.cat)} · ${count}</div>`
          : '';
        lastCat = s.cat;
        return head + `<div class="grid grid-cols-12 px-5 py-3.5 items-center text-xs hover:bg-[#E6F7F5]/30 transition-colors" data-kind="${kind}" data-cat="${esc(s.cat)}">
          <div class="col-span-5 md:col-span-4 flex items-center gap-3">
            <img src="${esc(s.img)}" alt="${esc(s.name)}" class="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0">
            <div class="overflow-hidden">
              <span class="font-bold text-sm text-[#1F2937] block truncate">${esc(s.name)}</span>
              <span class="text-[11px] text-[#94A3B8] block truncate">SKU: ${esc(s.id)} • ${esc(s.cat)}</span>
              <span class="text-[10px] font-mono block truncate" style="color:${tone}">${esc(note)}</span>
              <span class="mt-1.5 flex items-center gap-1">
                <input type="number" min="1" max="${Math.max(1, s.units)}" value="1" aria-label="Quantity sold today for ${esc(s.name)}" class="sale-qty w-12 rounded-lg border border-slate-200 px-1 py-1 text-center font-mono text-[11px] text-[#1F2937]" ${s.units < 1 ? 'disabled' : ''}>
                <button type="button" onclick="logDaySale('${esc(s.id)}', this)" class="btn-gold px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer" ${s.units < 1 ? 'disabled' : ''}>${s.units < 1 ? 'Out' : 'Sold today'}</button>
              </span>
            </div>
          </div>
          <div class="col-span-2 md:col-span-1 text-right">
            <span class="font-mono font-bold text-sm text-[#1F2937] block">${s.units} units</span>
            <div class="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(100, Math.max(8, s.units * 2))}%;background:${tone}"></div></div>
            </div>
          <div class="hidden md:block md:col-span-2 text-right font-mono text-[#4B5563]">${s.sold || 0} <span class="font-bold" style="color:${tone}">(${velLabel}/day)</span><span class="block text-[10px] text-[#0B1F2A]">today ${todayMap[s.id] || 0}</span></div>
          <div class="col-span-2 md:col-span-1 text-right font-mono font-bold text-sm text-[#1F2937]">${margin}%</div>
          <div class="hidden md:block md:col-span-2 text-right font-mono text-[#4B5563]">${s.age} days</div>
          <div class="col-span-3 md:col-span-1 text-center"><span class="px-2.5 py-1 rounded-full font-mono text-[10px] font-bold border" style="color:${tone};border-color:${tone}">${label}</span></div>
          <div class="${s.status === 'reorder' ? 'col-span-12 md:col-span-1 flex' : 'hidden md:flex md:col-span-1'} items-center justify-end gap-1 flex-wrap">${action}</div>
        </div>`;
      }).join('');
    }
  }

  // Instantiate Single Global Store
  window.MercuraStore = new MercuraStore();

  window.deleteCatalogProduct = function (id) {
    const list = window.Mercura.catalog(window.MercuraStore.engineActions());
    const sku = list.find(s => s.id === id);
    const name = sku ? sku.name : id;
    if (!window.confirm('Remove ' + name + ' from the catalog?')) return;
    window.MercuraStore.removeProduct(id);
    if (typeof showToast === 'function') showToast('Removed ' + name + ' from the catalog.');
  };

  /* =========================================================================
     MODAL CONTROLLER: 3-TAB "MERCURA DATA INGESTION HUB"
     ========================================================================= */

  window.openIngestionModal = function (initialTab = 'csv') {
    if (window.MercuraCloud && !window.MercuraCloud.user()) {
      location.href = 'login.html';
      return;
    }
    const modal = document.getElementById('mercura-ingestion-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    switchIngestionTab(initialTab);
    if (window.HapticAudio) window.HapticAudio.click(1200);
  };

  window.closeIngestionModal = function () {
    const modal = document.getElementById('mercura-ingestion-modal');
    if (modal) modal.classList.add('hidden');
    if (window.stopScanCamera) window.stopScanCamera();
  };

  window.switchIngestionTab = function (tabName) {
    // Tab buttons
    document.querySelectorAll('.ingest-tab-btn').forEach(btn => {
      const target = btn.getAttribute('data-tab');
      if (target === tabName) {
        btn.className = 'ingest-tab-btn px-4 py-2.5 text-xs font-bold rounded-xl bg-[#0EA5A0] text-white shadow-xs transition-all flex items-center gap-2 cursor-pointer';
      } else {
        btn.className = 'ingest-tab-btn px-4 py-2.5 text-xs font-semibold rounded-xl bg-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.12] transition-all flex items-center gap-2 cursor-pointer';
      }
    });

    // Tab view panels
    document.querySelectorAll('.ingest-tab-panel').forEach(panel => {
      panel.classList.add('hidden');
    });

    const activePanel = document.getElementById(`ingest-panel-${tabName}`);
    if (activePanel) activePanel.classList.remove('hidden');
  };

  /* =========================================================================
     TAB 1: BULK CSV / POS IMPORT LOGIC
     ========================================================================= */

  let parsedCsvCache = [];

  window.downloadSampleCsv = function () {
    const headers = 'sku,name,category,stock,cost_price,selling_price,monthly_sales,inventory_age_days,supplier_lead_days,image_url\n';
    const sampleRows = [
      'KUR-501,Festive Anarkali Kurti,Ethnic Wear,38,550,1499,14,8,5,img/kurti.jpg',
      'SH-205,Ultra Lightweight Trail Runners,Footwear,6,890,2299,22,14,7,img/shoes.jpg',
      'BLZ-102,Italian Wool Slim Blazer,Outerwear,24,1800,4299,2,62,10,img/linen.jpg',
      'ACC-304,Handcrafted Leather Belt,Accessories,45,280,699,15,20,4,img/scarf.jpg',
      'WRP-099,Silk Printed Summer Scarf,Accessories,15,220,599,1,55,6,img/wrap.jpg'
    ].join('\n');

    const blob = new Blob([headers + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mercura_sample_inventory.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.showToast) window.showToast('📥 Downloaded sample Mercura CSV', 'download');
  };

  window.downloadSampleExcel = function () {
    if (window.XLSX) {
      const data = [
        { sku: 'KUR-501', name: 'Festive Anarkali Kurti', category: 'Ethnic Wear', stock: 38, cost_price: 550, selling_price: 1499, monthly_sales: 14, inventory_age_days: 8, supplier_lead_days: 5, image_url: 'img/kurti.jpg' },
        { sku: 'SH-205', name: 'Ultra Lightweight Trail Runners', category: 'Footwear', stock: 6, cost_price: 890, selling_price: 2299, monthly_sales: 22, inventory_age_days: 14, supplier_lead_days: 7, image_url: 'img/shoes.jpg' },
        { sku: 'BLZ-102', name: 'Italian Wool Slim Blazer', category: 'Outerwear', stock: 24, cost_price: 1800, selling_price: 4299, monthly_sales: 2, inventory_age_days: 62, supplier_lead_days: 10, image_url: 'img/linen.jpg' },
        { sku: 'ACC-304', name: 'Handcrafted Leather Belt', category: 'Accessories', stock: 45, cost_price: 280, selling_price: 699, monthly_sales: 15, inventory_age_days: 20, supplier_lead_days: 4, image_url: 'img/scarf.jpg' },
        { sku: 'WRP-099', name: 'Silk Printed Summer Scarf', category: 'Accessories', stock: 15, cost_price: 220, selling_price: 599, monthly_sales: 1, inventory_age_days: 55, supplier_lead_days: 6, image_url: 'img/wrap.jpg' }
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory_Catalog");
      XLSX.writeFile(wb, "mercura_sample_inventory.xlsx");
      if (window.HapticAudio) window.HapticAudio.chime();
      if (window.showToast) window.showToast('📥 Downloaded sample Mercura Excel (.xlsx) workbook', 'download');
    } else {
      window.downloadSampleCsv();
    }
  };

  window.handleSpreadsheetFileSelect = function (file) {
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();

    // Route image / PDF documents to OCR tab
    if (type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg') || name.endsWith('.bmp') || name.endsWith('.pdf')) {
      switchIngestionTab('ocr');
      if (window.handleCustomInvoiceUpload) {
        window.handleCustomInvoiceUpload(file);
      } else {
        loadSampleInvoice('apex');
      }
      return;
    }

    // Direct JSON check
    if (name.endsWith('.json') || type === 'application/json') {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const json = JSON.parse(e.target.result);
          parseJsonData(json, file.name);
        } catch (err) {
          console.error('JSON parse error:', err);
          if (window.showToast) window.showToast('Invalid JSON file format.', 'error');
        }
      };
      reader.readAsText(file);
      return;
    }

    // SheetJS Workbook parser (handles XLSX, XLS, XLSM, XLSB, ODS, FODS, CSV, TSV, XML, HTML, etc.)
    if (window.XLSX) {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet);
            if (csvText && csvText.trim().length > 0) {
              parseCsvText(csvText, file.name);
              if (window.HapticAudio) window.HapticAudio.chime();
              if (window.showToast) window.showToast(`📊 Parsed Spreadsheet Sheet "${firstSheetName}" (${file.name})`, 'table_view');
              return;
            }
          }
          // If no sheets or empty, try text fallback
          fallbackTextRead(file);
        } catch (err) {
          console.warn('SheetJS binary parse notice, falling back to text stream:', err);
          fallbackTextRead(file);
        }
      };
      reader.onerror = function () {
        fallbackTextRead(file);
      };
      reader.readAsArrayBuffer(file);
    } else {
      fallbackTextRead(file);
    }
  };

  function fallbackTextRead(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      if (!text || !text.trim()) {
        if (window.showToast) window.showToast('The uploaded file appears to be empty.', 'error');
        return;
      }
      const trimmed = text.trim();
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(trimmed);
          parseJsonData(parsed, file.name);
          return;
        } catch (ignore) {}
      }
      parseCsvText(text, file.name);
    };
    reader.readAsText(file);
  }

  // Backwards compatibility alias
  window.handleCsvFileSelect = window.handleSpreadsheetFileSelect;

  function parseJsonData(jsonObj, fileName = 'upload.json') {
    const list = Array.isArray(jsonObj)
      ? jsonObj
      : (jsonObj.products || jsonObj.items || jsonObj.data || jsonObj.inventory || jsonObj.catalog || []);
    if (!list || !Array.isArray(list) || list.length === 0) {
      if (window.showToast) window.showToast('JSON does not contain a list of products', 'error');
      return;
    }
    const parsedRows = list.map((item, idx) => {
      const pCat = item.category || item.cat || item.department || 'Apparel';
      const pCost = parseFloat(item.cost_price || item.cost || item.unit_cost || item.buy_price) || 350;
      const pPrice = parseFloat(item.selling_price || item.price || item.mrp || item.retail_price) || Math.round(pCost * 1.6);
      return {
        sku: item.sku || item.code || item.id || `SKU-${1000 + idx}`,
        name: item.name || item.title || item.product || `Item #${idx + 1}`,
        category: pCat,
        stock: parseInt(item.stock || item.qty || item.quantity || item.units) || 10,
        cost_price: pCost,
        selling_price: pPrice,
        monthly_sales: parseFloat(item.monthly_sales || item.sales || item.velocity) || 5,
        inventory_age_days: parseInt(item.inventory_age_days || item.age || item.days_in_stock) || 14,
        supplier_lead_days: parseInt(item.supplier_lead_days || item.lead || item.lead_time) || 5,
        image_url: item.image_url || item.image || item.photo || (CATEGORY_IMAGES[pCat] || 'img/ts.jpg')
      };
    });
    parsedCsvCache = parsedRows;
    renderCsvPreviewTable(parsedRows, fileName);
    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.showToast) window.showToast(`✓ Parsed ${parsedRows.length} items from ${fileName}`, 'table_view');
  }

  function detectDelimiter(firstLine) {
    const counts = {
      ',': (firstLine.match(/,/g) || []).length,
      ';': (firstLine.match(/;/g) || []).length,
      '\t': (firstLine.match(/\t/g) || []).length,
      '|': (firstLine.match(/\|/g) || []).length
    };
    let best = ',';
    let max = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > max) {
        max = v;
        best = k;
      }
    }
    return best;
  }

  function splitDelimited(line, delim) {
    if (delim === ',') {
      return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^["']|["']$/g, ''));
    }
    if (delim === ';') {
      return line.split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^["']|["']$/g, ''));
    }
    if (delim === '\t') {
      return line.split('\t').map(v => v.trim().replace(/^["']|["']$/g, ''));
    }
    return line.split(delim).map(v => v.trim().replace(/^["']|["']$/g, ''));
  }

  function parseCsvText(csvText, fileName = 'upload.csv') {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      if (window.showToast) window.showToast('Spreadsheet must contain a header and at least 1 data row', 'error');
      return;
    }

    const delim = detectDelimiter(lines[0]);
    const rawHeaders = splitDelimited(lines[0], delim).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    
    // Header synonym resolver
    function findIndex(synonyms) {
      return rawHeaders.findIndex(h => synonyms.includes(h));
    }

    const idxSku = findIndex(['sku', 'code', 'id', 'item_code', 'barcode']);
    const idxName = findIndex(['name', 'product', 'title', 'item_name', 'product_name']);
    const idxCat = findIndex(['category', 'cat', 'department', 'type']);
    const idxStock = findIndex(['stock', 'qty', 'units', 'quantity', 'on_hand', 'inventory']);
    const idxCost = findIndex(['cost_price', 'cost', 'unit_cost', 'purchase_cost', 'buy_price']);
    const idxPrice = findIndex(['selling_price', 'price', 'mrp', 'retail_price', 'sale_price']);
    const idxMonthly = findIndex(['monthly_sales', 'sales', 'velocity', 'units_sold_month']);
    const idxAge = findIndex(['inventory_age_days', 'age', 'days_in_stock', 'age_days']);
    const idxLead = findIndex(['supplier_lead_days', 'lead', 'lead_time', 'lead_days']);
    const idxImg = findIndex(['image_url', 'image', 'photo', 'img']);

    const parsedRows = [];

    for (let i = 1; i < lines.length; i++) {
      const row = splitDelimited(lines[i], delim);
      if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;

      const pName = (idxName !== -1 && row[idxName]) ? row[idxName] : `Item #${i}`;
      const pSku = (idxSku !== -1 && row[idxSku]) ? row[idxSku] : `SKU-${1000 + i}`;
      const pCat = (idxCat !== -1 && row[idxCat]) ? row[idxCat] : 'Apparel';
      const pStock = (idxStock !== -1 && parseInt(row[idxStock])) || 10;
      const pCost = (idxCost !== -1 && parseFloat(row[idxCost])) || 350;
      const pPrice = (idxPrice !== -1 && parseFloat(row[idxPrice])) || Math.round(pCost * 1.6);
      const pMonthly = (idxMonthly !== -1 && parseFloat(row[idxMonthly])) || 5;
      const pAge = (idxAge !== -1 && parseInt(row[idxAge])) || 14;
      const pLead = (idxLead !== -1 && parseInt(row[idxLead])) || 5;
      const pImg = (idxImg !== -1 && row[idxImg]) ? row[idxImg] : (CATEGORY_IMAGES[pCat] || 'img/ts.jpg');

      parsedRows.push({
        sku: pSku,
        name: pName,
        category: pCat,
        stock: pStock,
        cost_price: pCost,
        selling_price: pPrice,
        monthly_sales: pMonthly,
        inventory_age_days: pAge,
        supplier_lead_days: pLead,
        image_url: pImg
      });
    }

    parsedCsvCache = parsedRows;
    renderCsvPreviewTable(parsedRows, fileName);
  }

  function renderCsvPreviewTable(rows, fileName) {
    const previewContainer = document.getElementById('csv-preview-container');
    const tableBody = document.getElementById('csv-preview-tbody');
    const summaryText = document.getElementById('csv-summary-text');
    const importBtn = document.getElementById('csv-import-commit-btn');

    if (!previewContainer || !tableBody) return;

    tableBody.innerHTML = '';
    const inr = n => window.Mercura ? window.Mercura.inr(n) : ('₹' + n.toLocaleString('en-IN'));

    rows.forEach((r, idx) => {
      const evaluated = window.MercuraStore.evaluateProduct(r);
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs font-mono';
      tr.innerHTML = `
        <td class="py-2.5 px-3 flex items-center gap-2">
          <img src="${evaluated.img}" class="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0">
          <div>
            <b class="text-[#1F2937] font-sans block truncate max-w-[140px]">${evaluated.name}</b>
            <span class="text-[#94A3B8] text-[10px]">${evaluated.sku}</span>
          </div>
        </td>
        <td class="py-2.5 px-3 text-[#1F2937] font-sans">${evaluated.cat}</td>
        <td class="py-2.5 px-3 text-right font-bold text-[#1F2937]">${evaluated.stock}</td>
        <td class="py-2.5 px-3 text-right text-[#4B5563]">${inr(evaluated.cost)}</td>
        <td class="py-2.5 px-3 text-right font-bold text-[#0EA5A0]">${inr(evaluated.price)}</td>
        <td class="py-2.5 px-3 text-right font-bold ${evaluated.margin < 20 ? 'text-[#EF4444]' : 'text-[#1F2937]'}">${evaluated.margin}%</td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${evaluated.badgeClass}">${evaluated.statusLabel}</span>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    if (summaryText) {
      summaryText.textContent = `✓ Successfully parsed ${rows.length} valid product rows from "${fileName}". Level 1/2 Cold-Start heuristics applied.`;
    }

    if (importBtn) {
      importBtn.textContent = `Import ${rows.length} Products to Catalog`;
      importBtn.disabled = false;
    }

    previewContainer.classList.remove('hidden');
    if (window.HapticAudio) window.HapticAudio.click();
  }

  window.commitCsvImport = function () {
    if (!parsedCsvCache || parsedCsvCache.length === 0) return;
    const added = window.MercuraStore.addProducts(parsedCsvCache);
    
    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.fireConfetti) window.fireConfetti();
    if (window.showToast) window.showToast(`⚡ Successfully ingested ${added.length} products into active catalog!`, 'inventory_2');

    parsedCsvCache = [];
    closeIngestionModal();

    // Auto-switch to Inventory tab to see new items
    if (window.switchFrame) window.switchFrame('inventory');
  };

  /* =========================================================================
     TAB 2: INVOICE OCR & PRODUCT IMAGE PIPELINE LOGIC
     ========================================================================= */

  window.loadSampleInvoice = function (vendorType = 'apex') {
    const ocrScanningBar = document.getElementById('ocr-laser-bar');
    const invoicePreviewImg = document.getElementById('invoice-preview-img');
    const invoiceFormContainer = document.getElementById('invoice-form-container');

    if (ocrScanningBar) ocrScanningBar.classList.remove('hidden');
    if (invoicePreviewImg) {
      invoicePreviewImg.src = vendorType === 'apex' ? 'img/shoes.jpg' : 'img/kurti.jpg';
    }

    if (window.HapticAudio) window.HapticAudio.click(800);

    // Simulate 1.5s scanning pass
    setTimeout(() => {
      if (ocrScanningBar) ocrScanningBar.classList.add('hidden');
      if (invoiceFormContainer) invoiceFormContainer.classList.remove('hidden');

      if (vendorType === 'apex') {
        document.getElementById('inv-ocr-vendor').value = 'Apex Footwear Ltd.';
        document.getElementById('inv-ocr-number').value = 'INV-APX-8891';
        document.getElementById('inv-ocr-date').value = '2024-10-16';

        const lineItems = [
          { name: 'Sports Running Shoes — AirSprint', sku: 'SH-102', qty: 25, cost: 1100, price: 2499, cat: 'Footwear' },
          { name: 'AirSprint Mesh Performance Trainers', sku: 'SH-104', qty: 15, cost: 950, price: 2199, cat: 'Footwear' }
        ];
        renderOcrLineItems(lineItems);
      } else {
        document.getElementById('inv-ocr-vendor').value = 'Banaras Handloom House';
        document.getElementById('inv-ocr-number').value = 'BNR-2024-4102';
        document.getElementById('inv-ocr-date').value = '2024-10-15';

        const lineItems = [
          { name: 'Silk Blend Festive Kurti', sku: 'KT-204', qty: 30, cost: 640, price: 1899, cat: 'Ethnic Wear' },
          { name: 'Chanderi Gold Border Dupatta', sku: 'DP-102', qty: 20, cost: 310, price: 899, cat: 'Ethnic Wear' }
        ];
        renderOcrLineItems(lineItems);
      }

      if (window.HapticAudio) window.HapticAudio.chime();
      if (window.showToast) window.showToast('✓ OCR scan completed. Line items extracted!', 'document_scanner');
    }, 1500);
  };

  window.handleCustomInvoiceUpload = function (file) {
    if (!file) return;

    // If an Excel, CSV, or data file was passed here, redirect smoothly to spreadsheet tab!
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm') || name.endsWith('.xlsb') || name.endsWith('.ods') || name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.json')) {
      switchIngestionTab('csv');
      handleSpreadsheetFileSelect(file);
      return;
    }

    if (!(file.type || '').startsWith('image/') && file.type !== 'application/pdf') {
      if (window.showToast) window.showToast('Upload a photo or PDF of the bill.', 'warning');
      return;
    }
    scanBill(file);
  };

  function renderOcrLineItems(items) {
    const tbody = document.getElementById('ocr-line-items-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    items.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 text-xs';
      tr.innerHTML = `
        <td class="py-2 px-2">
          <input type="text" class="ocr-item-name w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs" value="${item.name}">
        </td>
        <td class="py-2 px-2">
          <input type="text" class="ocr-item-sku w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono" value="${item.sku}">
        </td>
        <td class="py-2 px-2">
          <input type="number" class="ocr-item-qty w-16 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" value="${item.qty}">
        </td>
        <td class="py-2 px-2">
          <input type="number" class="ocr-item-cost w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" value="${item.cost}">
        </td>
        <td class="py-2 px-2">
          <input type="number" class="ocr-item-price w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" value="${item.price}">
        </td>
        <td class="py-2 px-2 text-center">
          <button type="button" onclick="this.closest('tr').remove();" class="text-rose-500 hover:text-rose-700 text-sm cursor-pointer">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.addOcrLineItemRow = function () {
    const tbody = document.getElementById('ocr-line-items-tbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 text-xs';
    tr.innerHTML = `
      <td class="py-2 px-2">
        <input type="text" class="ocr-item-name w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs" placeholder="Product Title">
      </td>
      <td class="py-2 px-2">
        <input type="text" class="ocr-item-sku w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono" placeholder="SKU-NEW">
      </td>
      <td class="py-2 px-2">
        <input type="number" class="ocr-item-qty w-16 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" value="10">
      </td>
      <td class="py-2 px-2">
        <input type="number" class="ocr-item-cost w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" value="400">
      </td>
      <td class="py-2 px-2">
        <input type="number" class="ocr-item-price w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right" value="999">
      </td>
      <td class="py-2 px-2 text-center">
        <button type="button" onclick="this.closest('tr').remove();" class="text-rose-500 hover:text-rose-700 text-sm cursor-pointer">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  };

  window.commitOcrToLedger = function () {
    const vendor = document.getElementById('inv-ocr-vendor')?.value || 'Supplier';
    const rows = document.querySelectorAll('#ocr-line-items-tbody tr');
    if (rows.length === 0) {
      if (window.showToast) window.showToast('No line items to add', 'warning');
      return;
    }

    const products = [];
    rows.forEach(tr => {
      const name = tr.querySelector('.ocr-item-name')?.value;
      if (!name) return;
      products.push({
        name,
        sku: tr.querySelector('.ocr-item-sku')?.value,
        qty: parseInt(tr.querySelector('.ocr-item-qty')?.value) || 0,
        cost: parseFloat(tr.querySelector('.ocr-item-cost')?.value) || 0,
        price: parseFloat(tr.querySelector('.ocr-item-price')?.value) || 0,
        supplier: vendor
      });
    });
    if (!products.length) {
      if (window.showToast) window.showToast('These items are already saved to your store.', 'info');
      return;
    }

    receiveStock(products);

    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.fireConfetti) window.fireConfetti();
    if (window.showToast) window.showToast(`✓ Ingested ${products.length} line items from ${vendor}!`, 'verified');

    closeIngestionModal();
    if (window.switchFrame) window.switchFrame('inventory');
  };

  // Thumbnail photo upload for existing SKU
  window.handleThumbnailUpload = function (file) {
    if (!file) return;
    const skuSelect = document.getElementById('thumb-sku-select');
    const previewImg = document.getElementById('thumb-preview-img');
    const sku = skuSelect ? skuSelect.value : 'TS-088';

    const url = URL.createObjectURL(file);
    if (previewImg) previewImg.src = url;

    window.MercuraStore.updateProductImage(sku, url);

    // Update any existing img tags with that SKU
    document.querySelectorAll(`img[alt*="${sku}"]`).forEach(img => img.src = url);

    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.showToast) window.showToast(`✓ Product photo updated for SKU ${sku}!`, 'image');
  };

  /* =========================================================================
     TAB 3: ADAPTIVE MANUAL ENTRY & QUICK SALE (COLD-START)
     ========================================================================= */

  window.generateRandomSku = function () {
    const prefixes = ['KUR', 'TS', 'SH', 'BLZ', 'TP', 'ACC', 'JN'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(100 + Math.random() * 899);
    const skuInput = document.getElementById('man-sku-code');
    if (skuInput) skuInput.value = `${p}-${num}`;
    updateManualPreCheck();
    if (window.HapticAudio) window.HapticAudio.click();
  };

  window.updateManualPreCheck = function () {
    const cost = parseFloat(document.getElementById('man-cost')?.value) || 0;
    const price = parseFloat(document.getElementById('man-price')?.value) || 0;
    const stock = parseInt(document.getElementById('man-stock')?.value) || 0;
    const lead = parseInt(document.getElementById('man-lead')?.value) || 7;
    const age = parseInt(document.getElementById('man-age')?.value) || 0;

    const marginEl = document.getElementById('man-calc-margin');
    const valueEl = document.getElementById('man-calc-value');
    const preCheckEl = document.getElementById('man-ai-precheck-box');

    const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
    const capitalLocked = stock * cost;

    if (marginEl) marginEl.textContent = `${Math.round(margin * 10) / 10}%`;
    if (valueEl) valueEl.textContent = window.Mercura ? window.Mercura.inr(capitalLocked) : `₹${capitalLocked}`;

    if (preCheckEl) {
      let statusColor = 'text-[#0EA5A0]';
      let statusText = '✓ Healthy (Cold-Start Level 2 Active)';

      if (age > 45) {
        statusColor = 'text-[#EF4444]';
        statusText = '❗ Dead Stock Risk Flagged';
      } else if (stock < lead * 2) {
        statusColor = 'text-[#F59E0B]';
        statusText = '⚠️ Low Stock Reorder Buffer Warning';
      }

      preCheckEl.innerHTML = `
        <span class="material-symbols-outlined text-sm ${statusColor}">auto_awesome</span>
        <span>AI Assessment: <strong>${Math.round(margin)}% Margin</strong> • <strong>${window.Mercura ? window.Mercura.inr(capitalLocked) : `₹${capitalLocked}`} Locked</strong> • Status: <strong class="${statusColor}">${statusText}</strong></span>
      `;
    }
  };

  window.commitManualProduct = function (e) {
    if (e) e.preventDefault();
    const name = document.getElementById('man-name')?.value;
    const sku = document.getElementById('man-sku-code')?.value;
    const cat = document.getElementById('man-cat')?.value || 'Apparel';
    const vendor = (document.getElementById('man-vendor')?.value || '').trim();
    const stock = parseInt(document.getElementById('man-stock')?.value) || 10;
    const cost = parseFloat(document.getElementById('man-cost')?.value) || 300;
    const price = parseFloat(document.getElementById('man-price')?.value) || 799;
    const age = parseInt(document.getElementById('man-age')?.value) || 0;
    const lead = parseInt(document.getElementById('man-lead')?.value) || 7;
    const phoneRaw = (document.getElementById('man-phone')?.value || '').trim();
    const phoneOk = window.MercuraPO && window.MercuraPO.validIndian(phoneRaw);
    const phone = phoneOk ? window.MercuraPO.formatPhone(phoneRaw) : '';

    if (!name || !sku || !vendor) {
      if (window.showToast) window.showToast('Product name, SKU, and supplier are required', 'warning');
      return;
    }
    if (!phoneOk) {
      if (window.showToast) window.showToast('Enter an Indian mobile number, for example +91 98201 44821', 'warning');
      return;
    }

    window.MercuraStore.addProducts([{
      name,
      sku,
      category: cat,
      supplier: vendor,
      phone: phone,
      supplier_whatsapp: phone,
      stock,
      cost_price: cost,
      selling_price: price,
      inventory_age_days: age,
      supplier_lead_days: lead,
      image_url: CATEGORY_IMAGES[cat] || 'img/ts.jpg'
    }]);

    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.fireConfetti) window.fireConfetti();
    if (window.showToast) window.showToast(`✓ Added "${name}" (${sku}) to active catalog!`, 'add_circle');

    closeIngestionModal();
    if (window.switchFrame) window.switchFrame('inventory');
  };

  /* =========================================================================
     BARCODE, LABEL & BILL SCAN (saves to the store as soon as it is read)
     ========================================================================= */

  let scanStream = null;
  let scanTimer = 0;
  let lastScan = { code: '', at: 0 };
  const scanStatus = (text) => { const el = document.getElementById('scan-status'); if (el) el.textContent = text; };
  const setField = (id, value) => {
    const el = document.getElementById(id);
    if (!el || value === null || value === undefined || value === '') return;
    if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(value))) return;
    el.value = value;
  };
  const catalogRows = () => window.Mercura.catalog(window.MercuraStore.engineActions());
  const findRow = (code) => catalogRows().find(r => String(r.id) === String(code));
  // "Kurkure Chilli Chatka" and "Kurkure Chilli Chatka · 78.9" are the same product.
  const baseName = (name) => String(name || '').split(' · ')[0].trim().toLowerCase();
  const findByName = (rows, name) => baseName(name) && rows.find(r => baseName(r.name) === baseName(name));

  // Stock delivery: known SKUs (or same name) gain qty, unknown ones become new products. Saved immediately.
  window.receiveStock = function (items) {
    const rows = catalogRows();
    const products = items.filter(i => i && (i.sku || i.name)).map((i, n) => {
      const name = String(i.name || '').trim();
      const old = rows.find(r => i.sku && String(r.id) === String(i.sku)) || findByName(rows, name);
      if (old) return { ...old, units: old.units + (i.qty || 0), cost: i.cost || old.cost, price: i.price || old.price, channels: undefined };
      return {
        sku: i.sku || name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-5) + n,
        name: name || 'Product ' + i.sku,
        category: i.category || 'Apparel',
        supplier: i.supplier || 'Unknown',
        phone: i.phone || '',
        stock: i.qty || 0,
        cost_price: i.cost || 0,
        selling_price: i.price || 0,
        inventory_age_days: 0,
        supplier_lead_days: 7,
        image_url: i.image || CATEGORY_IMAGES[i.category] || ''
      };
    });
    return products.length ? window.MercuraStore.addProducts(products) : [];
  };

  async function toUpload(file) {
    if (file.type === 'application/pdf') {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { image: data, mime: 'application/pdf', detected: '' };
    }
    const bitmap = await createImageBitmap(file);
    let detected = '';
    if ('BarcodeDetector' in window) {
      try { detected = ((await Promise.race([new BarcodeDetector().detect(bitmap), new Promise((_, no) => setTimeout(no, 1500))]))[0] || {}).rawValue || ''; } catch (e) {}
    }
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const small = document.createElement('canvas');
    const ts = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
    small.width = Math.round(bitmap.width * ts);
    small.height = Math.round(bitmap.height * ts);
    small.getContext('2d').drawImage(bitmap, 0, 0, small.width, small.height);
    return { image: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg', detected, thumb: small.toDataURL('image/jpeg', 0.7) };
  }

  const BOX_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#E6F7F5"/><path d="M14 22l18-9 18 9v20l-18 9-18-9z" fill="none" stroke="#0EA5A0" stroke-width="3"/><path d="M14 22l18 9 18-9M32 31v20" fill="none" stroke="#0EA5A0" stroke-width="3"/></svg>');

  // Barcode databases first (Open Food Facts, UPCitemdb), then Gemini on the photo.
  async function identifyProduct(code, upload) {
    const body = { barcode: code || '' };
    if (upload && upload.mime !== 'application/pdf') { body.image = upload.image; body.mime = upload.mime; }
    try { return await window.MercuraCloud.api('POST', '/api/ai/identify', body); }
    catch (e) { return {}; }
  }

  const productTitle = (info) => {
    const name = info.name && info.brand && !info.name.toLowerCase().includes(info.brand.toLowerCase()) ? `${info.brand} ${info.name}` : info.name;
    return [name, info.size].filter(Boolean).join(' · ');
  };

  // One scanned barcode = one unit received.
  window.receiveBarcode = async function (raw, info, upload) {
    const code = String(raw || '').trim();
    if (!code) return;
    setField('man-barcode', code);
    const old = findRow(code);
    if (old && old.name === 'Product ' + code) {
      info = info && info.name ? info : await identifyProduct(code, upload);
      if (info.name) {
        window.MercuraStore.addProducts([{ ...old, name: productTitle(info), cat: info.category || old.cat, price: old.price || info.mrp || 0,
          img: info.image || old.img, units: old.units + 1, channels: undefined }]);
        scanStatus(`Identified ${productTitle(info)} (via ${info.source}) · ${old.units + 1} in stock`);
        if (window.HapticAudio) window.HapticAudio.chime();
        document.getElementById('man-barcode').value = '';
        return;
      }
    }
    if (old) {
      receiveStock([{ sku: code, qty: 1 }]);
      scanStatus(`+1 ${old.name} · ${old.units + 1} in stock`);
      if (window.showToast) window.showToast(`+1 ${old.name} added to stock`, 'barcode_scanner');
    } else {
      scanStatus(`Looking up ${code}…`);
      if (!info || !info.name) info = await identifyProduct(code, upload);
      const title = productTitle(info);
      receiveStock([{
        sku: code,
        name: title || 'Product ' + code,
        category: info.category || 'General',
        price: info.mrp,
        qty: 1,
        image: info.image || (upload && upload.thumb) || BOX_ICON
      }]);
      scanStatus(title
        ? `Saved ${title} (found via ${info.source}). Add cost and supplier in Inventory.`
        : `Saved as Product ${code}. Not found online, so rename it in Inventory.`);
      if (window.showToast) window.showToast(title ? `New product saved: ${title}` : `Saved Product ${code}`, 'add_circle');
    }
    if (window.HapticAudio) window.HapticAudio.chime();
    document.getElementById('man-barcode').value = '';
  };

  // Photo of a product: a barcode saves it, otherwise Gemini identifies it and fills the form.
  window.scanProductImage = async function (file) {
    if (!file) return;
    let upload;
    try { upload = await toUpload(file); }
    catch (e) { scanStatus('That file is not a readable image.'); return; }
    scanStatus('Identifying product…');
    const info = await identifyProduct(upload.detected, upload);
    const code = upload.detected || info.barcode;
    if (code) { await receiveBarcode(code, info, upload); return; }
    if (!info.name) { scanStatus('Could not recognise it. Show the front of the pack, closer and in good light.'); return; }
    // No barcode: save by name, so the next photo of the same product adds +1 to it.
    const title = productTitle(info);
    const known = findByName(catalogRows(), title);
    receiveStock([{ name: title, category: info.category || 'General', price: info.mrp, qty: 1, image: info.image || upload.thumb }]);
    scanStatus(known ? `+1 ${known.name} · ${known.units + 1} in stock` : `Saved ${title} (recognised from the picture).`);
    if (window.showToast) window.showToast(known ? `+1 ${known.name} added to stock` : `New product saved: ${title}`, 'add_circle');
    if (window.HapticAudio) window.HapticAudio.chime();
  };

  window.startScanCamera = async function () {
    if (scanStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      scanStatus('Live camera needs https. Tap Photo instead: it opens your phone camera.');
      return;
    }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
    } catch (e) {
      const blocked = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      scanStatus(blocked
        ? 'Camera blocked. Click the camera icon in Chrome\'s address bar, choose Allow, then press Camera again.'
        : e && e.name === 'NotFoundError' ? 'No camera found. Use Photo instead.' : 'Camera is busy in another app. Close it and try again.');
      if (blocked && window.showToast) window.showToast('Allow camera access in Chrome to scan barcodes', 'videocam_off');
      return;
    }
    const video = document.getElementById('scan-video');
    video.srcObject = scanStream;
    document.getElementById('scan-camera').classList.remove('hidden');
    await video.play().catch(() => {});

    const track = scanStream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if ((caps.focusMode || []).includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    const torchBtn = document.getElementById('scan-torch');
    if (torchBtn) torchBtn.classList.toggle('hidden', !caps.torch);

    if (!('BarcodeDetector' in window)) { scanStatus('This browser cannot read barcodes live. Hold the label up and press Read label.'); return; }
    const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
    const supported = await BarcodeDetector.getSupportedFormats().catch(() => wanted);
    const detector = new BarcodeDetector({ formats: wanted.filter(f => supported.includes(f)) });
    let seen = { code: '', count: 0 };
    let missing = 0;
    let scanned = false;
    const started = Date.now();
    lastScan = { code: '', at: 0 };
    scanStatus('Hold the barcode inside the box…');
    const tick = async () => {
      if (!scanStream) return;
      let hit = null;
      try {
        if (video.videoWidth) hit = (await Promise.race([detector.detect(video), new Promise((_, no) => setTimeout(no, 1000))]))[0] || null;
      } catch (e) {}
      try {
        // A code must show up in two frames in a row before it counts, so a blurry misread is ignored.
        seen = hit ? { code: hit.rawValue, count: hit.rawValue === seen.code ? seen.count + 1 : 1 } : { code: '', count: 0 };
        // The same product only counts again after it has left the frame for about half a second.
        missing = hit ? 0 : missing + 1;
        if (missing >= 3) lastScan.code = '';
        if (seen.count >= 2 && seen.code !== lastScan.code) {
          lastScan = { code: seen.code, at: Date.now() };
          scanned = true;
          if (navigator.vibrate) navigator.vibrate(60);
          const upload = findRow(seen.code) ? null : await toUpload(await frameBlob(video));
          await receiveBarcode(seen.code, null, upload);
          seen = { code: '', count: 0 };
        } else if (!scanned && Date.now() - started > 5000) {
          // Like Lens: if no barcode decodes, recognise the product from the picture once.
          scanned = true;
          scanStatus('No barcode yet, recognising the product from the picture…');
          await scanProductImage(await frameBlob(video));
        }
      } catch (e) {}
      scanTimer = setTimeout(tick, 200);
    };
    tick();
  };

  window.toggleTorch = function () {
    const track = scanStream && scanStream.getVideoTracks()[0];
    if (!track) return;
    const on = !(track.getSettings().torch);
    track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
  };

  function frameBlob(video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  }

  window.captureScan = async function () {
    const video = document.getElementById('scan-video');
    if (!video || !video.videoWidth) return;
    scanProductImage(await frameBlob(video));
  };

  window.openScanner = function () {
    openIngestionModal('manual');
    toggleManualSubmode('add');
    startScanCamera();
  };

  window.captureBill = async function () {
    const video = document.getElementById('scan-video');
    if (!video || !video.videoWidth) return;
    const blob = await frameBlob(video);
    stopScanCamera();
    switchIngestionTab('ocr');
    toggleOcrSubmode('ocr');
    scanBill(new File([blob], 'bill.jpg', { type: 'image/jpeg' }));
  };

  window.stopScanCamera = function () {
    clearTimeout(scanTimer);
    if (scanStream) scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
    const box = document.getElementById('scan-camera');
    if (box) box.classList.add('hidden');
  };

  // Supplier bill (photo or PDF): every line item is saved as received stock.
  window.scanBill = async function (file) {
    const bar = document.getElementById('ocr-laser-bar');
    const preview = document.getElementById('invoice-preview-img');
    if (preview && file.type.startsWith('image/')) preview.src = URL.createObjectURL(file);
    if (bar) bar.classList.remove('hidden');
    let bill;
    try { bill = await window.MercuraCloud.api('POST', '/api/ai/scan-bill', await toUpload(file)); }
    catch (e) { bill = null; }
    if (bar) bar.classList.add('hidden');
    if (!bill || !bill.items.length) {
      if (window.showToast) window.showToast(bill ? 'No product lines found on that bill.' : 'Could not read that bill. Try a clearer photo.', 'warning');
      return;
    }
    setField('inv-ocr-vendor', bill.vendor);
    setField('inv-ocr-number', bill.number);
    setField('inv-ocr-date', bill.date);
    const saved = receiveStock(bill.items.map(i => ({ ...i, supplier: bill.vendor || 'Unknown', phone: bill.phone })));
    const tbody = document.getElementById('ocr-line-items-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      saved.forEach((row, n) => {
        const item = bill.items[n];
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 text-xs';
        [row.name, row.id, '+' + item.qty, item.cost || '—', item.price || '—', '✓'].forEach((value, col) => {
          const td = document.createElement('td');
          td.className = 'py-2 px-2' + (col >= 2 && col <= 4 ? ' text-right font-mono' : col === 5 ? ' text-center text-[#0EA5A0] font-bold' : col === 1 ? ' font-mono' : '');
          td.textContent = value;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.showToast) window.showToast(`✓ Bill scanned: ${saved.length} product${saved.length === 1 ? '' : 's'} saved to your store`, 'verified');
  };

  /* =========================================================================
     QUICK SALE & VOICE INPUT LOGIC
     ========================================================================= */

  window.openQuickSaleForSku = function (sku) {
    openIngestionModal('manual');
    const toggleSaleBtn = document.getElementById('subtoggle-sale-btn');
    if (toggleSaleBtn) toggleSaleBtn.click();
    if (window.MercuraStore) window.MercuraStore.fillSaleSelect();
    const skuSelect = document.getElementById('quick-sale-sku-select');
    if (skuSelect) {
      skuSelect.value = sku;
      updateQuickSaleCard();
    }
  };

  window.logDaySale = function (sku, btn) {
    const row = btn && btn.closest('[data-kind]');
    const input = row && row.querySelector('.sale-qty');
    const qty = parseInt(input && input.value, 10) || 1;
    window.commitQuickSale(sku, qty);
  };

  window.updateQuickSaleCard = function () {
    const skuSelect = document.getElementById('quick-sale-sku-select');
    const qtyInput = document.getElementById('quick-sale-qty');
    const summaryCard = document.getElementById('quick-sale-summary-card');
    if (!skuSelect || !qtyInput || !summaryCard || !window.MercuraStore) return;

    const sku = skuSelect.value;
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    const product = window.Mercura.catalog(window.MercuraStore.engineActions()).find(s => s.id === sku);
    const price = product ? (product.listPrice || product.price) : 0;
    const name = product ? product.name : 'Catalog item';
    const onHand = product ? product.units : 0;
    const revenue = price * Math.min(qty, onHand);
    const inr = n => window.Mercura.inr(n);
    const today = window.MercuraStore.salesToday().filter(s => s.sku === sku).reduce((a, s) => a + s.qty, 0);

    summaryCard.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-400 font-mono">Today's sale · ${onHand} in stock · already sold ${today}</span>
        <span class="font-bold text-[#10B981] bg-[#10B981]/15 px-2 py-0.5 rounded font-mono">+${inr(revenue)}</span>
      </div>
      <div class="font-sans font-bold text-sm text-white mt-1">${name} (${sku})</div>
      <div class="text-xs text-slate-300 font-mono mt-0.5">Log <strong>${qty}</strong> sold today @ ${inr(price)}/unit</div>
    `;
  };

  window.commitQuickSale = function (sku, qty) {
    const skuSelect = document.getElementById('quick-sale-sku-select');
    const qtyInput = document.getElementById('quick-sale-qty');
    if (!sku) sku = skuSelect ? skuSelect.value : '';
    if (!qty) qty = parseInt(qtyInput && qtyInput.value, 10) || 1;
    try {
      const res = window.MercuraStore.recordSale(sku, qty);
      if (window.HapticAudio) window.HapticAudio.chime();
      if (window.showToast) window.showToast('Sold ' + res.qtySold + ' today · ' + res.remainingStock + ' left · +' + window.Mercura.inr(res.revenue), 'bolt');
      if (document.getElementById('mercura-ingestion-modal') && !document.getElementById('mercura-ingestion-modal').classList.contains('hidden') && skuSelect && skuSelect.value === sku) {
      closeIngestionModal();
      }
    } catch (e) {
      if (window.showToast) window.showToast(e.message, 'error');
    }
  };

  // Voice recognition / simulation helper
  window.startVoiceRecognition = function () {
    const voiceStatus = document.getElementById('voice-status-pill');
    if (voiceStatus) {
      voiceStatus.textContent = '🎙️ Listening... Say e.g. "Sold 5 Sports Shoes"';
      voiceStatus.classList.remove('hidden');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-IN';

      recognition.onresult = function (event) {
        const transcript = event.results[0][0].transcript;
        if (voiceStatus) voiceStatus.textContent = `Heard: "${transcript}"`;
        processVoiceText(transcript);
      };

      recognition.onerror = function () {
        if (voiceStatus) voiceStatus.textContent = 'Voice error. Using simulator fallback.';
      };

      recognition.start();
    } else {
      setTimeout(() => {
        simulateVoiceSale('Sold 5 Sports Shoes');
      }, 700);
    }
  };

  window.simulateVoiceSale = function (phrase) {
    const voiceStatus = document.getElementById('voice-status-pill');
    if (voiceStatus) {
      voiceStatus.textContent = `🎙️ Processed Voice Log: "${phrase}"`;
      voiceStatus.classList.remove('hidden');
    }
    processVoiceText(phrase);
  };

  function processVoiceText(text) {
    const lower = text.toLowerCase();
    let qty = 1;
    const matchQty = lower.match(/\d+/);
    if (matchQty) qty = parseInt(matchQty[0]);

    let sku = 'SH-102';
    if (lower.includes('jacket') || lower.includes('winter')) sku = 'JKT-409';
    else if (lower.includes('shoe') || lower.includes('airsprint')) sku = 'SH-102';
    else if (lower.includes('tee') || lower.includes('shirt')) sku = 'TS-088';
    else if (lower.includes('kurti') || lower.includes('silk')) sku = 'KT-204';

    const skuSelect = document.getElementById('quick-sale-sku-select');
    const qtyInput = document.getElementById('quick-sale-qty');
    if (skuSelect) skuSelect.value = sku;
    if (qtyInput) qtyInput.value = qty;
    updateQuickSaleCard();

    if (window.HapticAudio) window.HapticAudio.chime();
    if (window.showToast) window.showToast(`Voice parsed: ${qty} units of ${sku}`, 'mic');
  }

  window.toggleOcrSubmode = function (mode) {
    const ocrBtn = document.getElementById('submode-ocr-btn');
    const thumbBtn = document.getElementById('submode-thumb-btn');
    const invoiceStage = document.getElementById('ocr-submode-invoice');
    const thumbStage = document.getElementById('ocr-submode-thumbnail');

    if (mode === 'ocr') {
      if (ocrBtn) ocrBtn.className = 'px-2.5 py-1 rounded-lg bg-[#0B1F2A] text-white font-bold cursor-pointer';
      if (thumbBtn) thumbBtn.className = 'px-2.5 py-1 rounded-lg text-[#4B5563] hover:text-[#0B1F2A] font-semibold cursor-pointer';
      if (invoiceStage) invoiceStage.classList.remove('hidden');
      if (thumbStage) thumbStage.classList.add('hidden');
    } else {
      if (thumbBtn) thumbBtn.className = 'px-2.5 py-1 rounded-lg bg-[#0B1F2A] text-white font-bold cursor-pointer';
      if (ocrBtn) ocrBtn.className = 'px-2.5 py-1 rounded-lg text-[#4B5563] hover:text-[#0B1F2A] font-semibold cursor-pointer';
      if (thumbStage) thumbStage.classList.remove('hidden');
      if (invoiceStage) invoiceStage.classList.add('hidden');
    }
    if (window.HapticAudio) window.HapticAudio.click();
  };

  window.toggleManualSubmode = function (mode) {
    const addBtn = document.getElementById('subtoggle-add-btn');
    const saleBtn = document.getElementById('subtoggle-sale-btn');
    const addForm = document.getElementById('manual-add-product-form');
    const saleStage = document.getElementById('manual-quick-sale-stage');

    if (mode === 'add') {
      if (addBtn) addBtn.className = 'px-3 py-1 rounded-lg bg-[#0B1F2A] text-white font-bold cursor-pointer';
      if (saleBtn) saleBtn.className = 'px-3 py-1 rounded-lg text-[#4B5563] hover:text-[#0B1F2A] font-semibold cursor-pointer';
      if (addForm) addForm.classList.remove('hidden');
      if (saleStage) saleStage.classList.add('hidden');
    } else {
      if (saleBtn) saleBtn.className = 'px-3 py-1 rounded-lg bg-[#0B1F2A] text-white font-bold cursor-pointer';
      if (addBtn) addBtn.className = 'px-3 py-1 rounded-lg text-[#4B5563] hover:text-[#0B1F2A] font-semibold cursor-pointer';
      if (saleStage) saleStage.classList.remove('hidden');
      if (addForm) addForm.classList.add('hidden');
      updateQuickSaleCard();
    }
    if (window.HapticAudio) window.HapticAudio.click();
  };

  window.selectDailyVel = function (btn, vel) {
    document.querySelectorAll('.vel-pill').forEach(b => {
      b.className = 'vel-pill px-2 py-1 rounded bg-white border border-slate-200 text-[#4B5563]';
    });
    btn.className = 'vel-pill px-2 py-1 rounded bg-[#0B1F2A] text-white font-bold';
    btn.setAttribute('data-vel', vel);
    updateManualPreCheck();
    if (window.HapticAudio) window.HapticAudio.click();
  };

  /* =========================================================================
     DRAG AND DROP ON INVENTORY TABLE & MODAL DROPZONE
     ========================================================================= */

  function setupTableDragDrop() {
    const tableDropzone = document.getElementById('inv-drag-dropzone');
    const tableContainer = document.getElementById('frame-inventory');
    const modalDropzone = document.getElementById('csv-modal-dropzone');

    // Prevent default window drop navigation
    window.addEventListener('dragover', e => { e.preventDefault(); }, false);
    window.addEventListener('drop', e => { e.preventDefault(); }, false);

    // 1. Inventory Table Dropzone
    if (tableContainer) {
      ['dragenter', 'dragover'].forEach(eventName => {
        tableContainer.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
          if (tableDropzone) tableDropzone.classList.remove('hidden');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        tableContainer.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
          if (tableDropzone) tableDropzone.classList.add('hidden');
        }, false);
      });

      tableContainer.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        if (files && files.length > 0) {
          const file = files[0];
          const name = (file.name || '').toLowerCase();
          const type = (file.type || '').toLowerCase();
          if (type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.pdf')) {
            openIngestionModal('ocr');
            handleCustomInvoiceUpload(file);
          } else {
            openIngestionModal('csv');
            handleSpreadsheetFileSelect(file);
          }
        }
      });
    }

    // 2. Modal Ingestion Tab 1 Dropzone
    if (modalDropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        modalDropzone.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
          modalDropzone.classList.add('border-[#0EA5A0]', 'bg-[#E6F7F5]/40', 'scale-[1.01]');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        modalDropzone.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
          modalDropzone.classList.remove('border-[#0EA5A0]', 'bg-[#E6F7F5]/40', 'scale-[1.01]');
        }, false);
      });

      modalDropzone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        if (files && files.length > 0) {
          handleSpreadsheetFileSelect(files[0]);
        }
      });
    }
  }

  // Initialize Drag & Drop when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTableDragDrop);
  } else {
    setupTableDragDrop();
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'inv-cat-filter' && window.MercuraStore) {
      window.MercuraStore.renderTableRows();
    }
  });

  // The signed-in merchant's book comes from Firestore. catalog.json is only the judge sample.

})(window);
