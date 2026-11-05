let allBriefs = [];
let latestBrief = null;

// 將 Google Doc 編輯網址轉為免干擾的 Preview 嵌入網址
function getEmbedUrl(url) {
  if (!url) return '';
  if (url.includes('/edit')) {
    return url.replace(/\/edit.*$/, '/preview');
  }
  return url;
}

// 載入資料庫
async function loadBriefs() {
  try {
    const res = await fetch('data/briefs.json?v=' + Date.now());
    if (res.ok) {
      allBriefs = await res.json();
    } else {
      console.warn('載入 briefs.json 失敗，改用備份');
    }
  } catch (err) {
    console.log('[INFO] 讀取本機 briefs.json 錯誤:', err);
  }

  // 尋找最新一期（優先找 is_latest 或第一筆）
  latestBrief = allBriefs.find(b => b.is_latest) || allBriefs[0];

  renderHeroCard(latestBrief);
  renderArchiveGrid(allBriefs);
  updateStatsHeader();
}

// 渲染 Hero 最新快照
function renderHeroCard(item) {
  if (!item) return;

  document.getElementById('heroDate').textContent = item.display_date || item.date;
  document.getElementById('heroTitle').textContent = item.title;
  document.getElementById('heroDesc').textContent = item.summary || '今日台股最新關鍵價位與進出場策略。';
  
  // 更新 Google Doc 連結
  const btnOpen = document.getElementById('btnOpenDoc');
  if (!item.url || item.url === '#' || item.url.trim() === '') {
    btnOpen.href = '#';
    btnOpen.innerHTML = '<i class="fa-solid fa-pen-nib"></i> 盤後分析報告撰寫中（稍後上線）';
    btnOpen.onclick = (e) => {
      e.preventDefault();
      showToast('📝 今日 VIP 盤後分析報告正在撰寫整理中，請稍候片刻！');
    };
  } else {
    btnOpen.href = item.url;
    btnOpen.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> 立即開啟 Google Doc 完整閱讀';
    btnOpen.onclick = null;
  }

  // 標籤渲染
  const tagsContainer = document.getElementById('heroTags');
  tagsContainer.innerHTML = '';
  if (item.tags && item.tags.length) {
    item.tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag-pill';
      span.textContent = '#' + t;
      tagsContainer.appendChild(span);
    });
  }

  // 專屬大盤與三大法人籌碼面板
  const marketWrap = document.getElementById('marketOverviewContainer');
  if (item.market_overview) {
    marketWrap.style.display = 'flex';
    renderMarketOverview(marketWrap, item.market_overview);
  } else {
    marketWrap.style.display = 'none';
  }

  // 站內預覽按鈕
  document.getElementById('btnPreviewDoc').onclick = () => {
    if (!item.url || item.url === '#' || item.url.trim() === '') {
      showToast('📝 今日 VIP 盤後分析報告正在撰寫整理中，請稍候片刻！');
      return;
    }
    openPreviewModal(item.title, item.url);
  };

  // 複製單篇連結
  document.getElementById('btnCopyDocLink').onclick = () => {
    if (!item.url || item.url === '#' || item.url.trim() === '') {
      showToast('📝 今日 VIP 盤後分析報告正在撰寫整理中，請稍候片刻！');
      return;
    }
    copyToClipboard(item.url, `已複製「${item.display_date} 盤後快訊」的 Google Doc 連結！`);
  };

  // 手機版底部快捷操作列綁定
  const mBtnOpen = document.getElementById('mBtnOpenDoc');
  if (mBtnOpen) {
    if (!item.url || item.url === '#' || item.url.trim() === '') {
      mBtnOpen.href = '#';
      mBtnOpen.onclick = (e) => {
        e.preventDefault();
        showToast('📝 今日 VIP 盤後分析報告正在撰寫整理中，請稍候片刻！');
      };
    } else {
      mBtnOpen.href = item.url;
      mBtnOpen.onclick = null;
    }
  }

  const mBtnPreview = document.getElementById('mBtnPreviewDoc');
  if (mBtnPreview) {
    mBtnPreview.onclick = () => {
      if (!item.url || item.url === '#' || item.url.trim() === '') {
        showToast('📝 今日 VIP 盤後分析報告正在撰寫整理中，請稍候片刻！');
        return;
      }
      openPreviewModal(item.title, item.url);
    };
  }

  const mBtnShare = document.getElementById('mBtnShare');
  if (mBtnShare) {
    mBtnShare.onclick = () => {
      shareBrief(item);
    };
  }
}

// 渲染大盤行情與籌碼 TOP10 面板
function renderMarketOverview(container, m) {
  const inst = m.institutions || {};

  container.innerHTML = `
    <!-- 重點核心摘要引言 -->
    <div class="market-lead-box">
      <i class="fa-solid fa-bolt" style="color: #38bdf8; margin-right: 6px;"></i>
      ${m.lead_paragraph || ''}
    </div>

    <!-- 大盤核心指數看板 -->
    <div class="market-stats-row">
      <div class="m-stat-pill">
        <div class="m-stat-title">加權指數收盤</div>
        <div class="m-stat-number down">
          <span>${m.index_close || '--'}</span>
          <span style="font-size: 13px;">${m.index_change || ''}</span>
        </div>
      </div>
      <div class="m-stat-pill">
        <div class="m-stat-title">大盤成交金額</div>
        <div class="m-stat-number">
          <span>${m.volume || '--'}</span>
        </div>
      </div>
      <div class="m-stat-pill" style="grid-column: span 2;">
        <div class="m-stat-title">月線走勢總結</div>
        <div class="m-stat-sub" style="font-size: 13px; color: #cbd5e1; margin-top: 4px;">
          <i class="fa-solid fa-chart-line" style="color: #f43f5e; margin-right: 4px;"></i>
          ${m.monthly_change || '全月加權指數震盪洗盤'}
        </div>
      </div>
    </div>

    <!-- 三大法人買賣超看板 -->
    <div class="inst-cards-row">
      <div class="inst-pill">
        <div class="inst-name">外資及陸資</div>
        <div class="inst-val sell">${inst.foreign || '--'}</div>
        <div class="inst-sub">${inst.foreign_futures || '期貨空單維持高水位'}</div>
      </div>
      <div class="inst-pill">
        <div class="inst-name">投信護盤</div>
        <div class="inst-val buy">${inst.investment_trust || '--'}</div>
        <div class="inst-sub">${inst.trust_note || '連續買超力挺護盤'}</div>
      </div>
      <div class="inst-pill">
        <div class="inst-name">自營商合計</div>
        <div class="inst-val sell">${inst.dealer || '--'}</div>
        <div class="inst-sub">${inst.dealer_note || '自行買賣與避險操作'}</div>
      </div>
      <div class="inst-pill">
        <div class="inst-name">三大法人合計</div>
        <div class="inst-val sell">${inst.total || '--'}</div>
        <div class="inst-sub">${inst.total_note || '三大法人合計動向'}</div>
      </div>
    </div>

    <!-- 外資與投信 TOP10 買賣超榜單 -->
    <div class="top10-ranking-grid">
      <!-- 外資榜單 -->
      <div class="ranking-col">
        <div class="ranking-header">
          <span><i class="fa-solid fa-globe" style="color: #60a5fa; margin-right: 6px;"></i>外資買賣超前十大個股</span>
        </div>
        <div class="ranking-group">
          <div class="group-label buy">
            <i class="fa-solid fa-circle-arrow-up"></i> 外資買超 TOP 10
          </div>
          <div class="stock-chips-wrap">
            ${(m.foreign_top_buy || []).map(s => `<span class="stock-chip buy">${s}</span>`).join('')}
          </div>
        </div>
        <div class="ranking-group">
          <div class="group-label sell">
            <i class="fa-solid fa-circle-arrow-down"></i> 外資賣超 TOP 10
          </div>
          <div class="stock-chips-wrap">
            ${(m.foreign_top_sell || []).map(s => `<span class="stock-chip sell">${s}</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- 投信榜單 -->
      <div class="ranking-col">
        <div class="ranking-header">
          <span><i class="fa-solid fa-building-columns" style="color: #f43f5e; margin-right: 6px;"></i>投信買賣超前十大個股</span>
        </div>
        <div class="ranking-group">
          <div class="group-label buy">
            <i class="fa-solid fa-circle-arrow-up"></i> 投信買超 TOP 10
          </div>
          <div class="stock-chips-wrap">
            ${(m.trust_top_buy || []).map(s => `<span class="stock-chip buy">${s}</span>`).join('')}
          </div>
        </div>
        <div class="ranking-group">
          <div class="group-label sell">
            <i class="fa-solid fa-circle-arrow-down"></i> 投信賣超 TOP 10
          </div>
          <div class="stock-chips-wrap">
            ${(m.trust_top_sell || []).map(s => `<span class="stock-chip sell">${s}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

let isArchiveExpanded = false;

// 渲染歷史歸檔列表
function renderArchiveGrid(list, isSearchResult = false) {
  const grid = document.getElementById('archiveGrid');
  const toggleWrap = document.getElementById('archiveToggleWrap');
  const toggleText = document.getElementById('toggleArchiveText');
  const toggleIcon = document.getElementById('toggleArchiveIcon');
  grid.innerHTML = '';

  if (!list || list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-file-circle-question"></i>
        <h3>找不到符合的快訊紀錄</h3>
        <p>請嘗試更換搜尋關鍵字或清除搜尋框</p>
      </div>
    `;
    if (toggleWrap) toggleWrap.style.display = 'none';
    return;
  }

  // 決定顯示範圍：搜尋結果直接全部展示；主列表預設只顯示前 3 篇
  let displayList = list;
  const DEFAULT_LIMIT = 3;

  if (!isSearchResult && list.length > DEFAULT_LIMIT) {
    if (toggleWrap) {
      toggleWrap.style.display = 'flex';
      const remaining = list.length - DEFAULT_LIMIT;
      if (!isArchiveExpanded) {
        displayList = list.slice(0, DEFAULT_LIMIT);
        toggleText.textContent = `展開更多歷史快訊 (尚有 ${remaining} 篇)`;
        toggleIcon.className = 'fa-solid fa-chevron-down';
      } else {
        displayList = list;
        toggleText.textContent = '收合歷史快訊';
        toggleIcon.className = 'fa-solid fa-chevron-up';
      }
    }
  } else {
    if (toggleWrap) toggleWrap.style.display = 'none';
  }

  displayList.forEach(item => {
    const isLatest = item.id === (latestBrief ? latestBrief.id : '');
    const card = document.createElement('div');
    card.className = 'archive-card';

    const tagsHtml = (item.tags || []).map(t => `<span class="tag-pill">#${t}</span>`).join('');
    const hasValidUrl = item.url && item.url !== '#' && item.url.trim() !== '';

    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="card-date-badge ${isLatest ? 'latest' : ''}">
            ${isLatest ? '🔥 最新 ' : ''}${item.display_date || item.date}
          </span>
          <span style="font-size: 11px; color: var(--text-muted);">${item.date}</span>
        </div>
        <h3 class="card-title">${item.title}</h3>
        <p class="card-desc">${item.summary || '點擊進入查閱完整文件內容。'}</p>
        <div class="card-tags">${tagsHtml}</div>
      </div>
      <div class="card-actions">
        ${hasValidUrl ? `
          <a href="${item.url}" target="_blank" class="btn-primary btn-sm" style="flex: 1;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> 開啟閱讀
          </a>
          <button class="btn-glass btn-sm btn-card-preview" title="站內預覽">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn-secondary btn-sm btn-card-copy" title="複製連結">
            <i class="fa-regular fa-copy"></i>
          </button>
        ` : `
          <button class="btn-primary btn-sm btn-card-pending" style="flex: 1; background: rgba(244, 63, 94, 0.15); border: 1px dashed rgba(244, 63, 94, 0.4); color: #fca5a5; cursor: pointer; padding: 9px 12px; font-size: 13px; font-weight: 700; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; gap: 8px;">
            <i class="fa-solid fa-pen-nib"></i> 報告撰寫中（稍後上線）
          </button>
        `}
      </div>
    `;

    // 綁定卡片按鈕事件
    if (hasValidUrl) {
      const btnPrev = card.querySelector('.btn-card-preview');
      if (btnPrev) {
        btnPrev.onclick = () => openPreviewModal(item.title, item.url);
      }
      const btnCopy = card.querySelector('.btn-card-copy');
      if (btnCopy) {
        btnCopy.onclick = () => copyToClipboard(item.url, `已複製「${item.display_date} 盤後快訊」連結！`);
      }
    } else {
      const btnPending = card.querySelector('.btn-card-pending');
      if (btnPending) {
        btnPending.onclick = (e) => {
          e.preventDefault();
          showToast(`📝 ${item.display_date || item.date} 盤後分析報告正在撰寫整理中，請稍候片刻！`);
        };
      }
    }

    grid.appendChild(card);
  });
}

// 綁定展開/收合按鈕
const btnToggleArchive = document.getElementById('btnToggleArchive');
if (btnToggleArchive) {
  btnToggleArchive.onclick = () => {
    isArchiveExpanded = !isArchiveExpanded;
    renderArchiveGrid(allBriefs, false);
    if (!isArchiveExpanded) {
      document.querySelector('.archive-section').scrollIntoView({ behavior: 'smooth' });
    }
  };
}

// 統計資訊更新
function updateStatsHeader() {
  document.getElementById('totalBriefsCount').textContent = `${allBriefs.length} 篇 VIP 快訊`;
  initCounter();
}

// 訪客計數器（整合 CounterAPI 與優雅在地降級備援）
async function initCounter() {
  const NAMESPACE = 'jwood-stock-brief';
  const todayKey = 'views_' + new Date().toISOString().slice(0, 10);
  
  let todayCount = parseInt(localStorage.getItem(todayKey) || '18', 10) + 1;
  let totalCount = parseInt(localStorage.getItem('total_views') || '420', 10) + 1;
  localStorage.setItem(todayKey, todayCount);
  localStorage.setItem('total_views', totalCount);

  try {
    const res = await fetch(`https://api.counterapi.dev/v1/${NAMESPACE}/visits/up`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.count) {
        totalCount = data.count + 320;
      }
    }
  } catch (e) {
    // 網路防禦，平滑採用本機計數
  }

  document.getElementById('todayViews').textContent = todayCount.toLocaleString() + ' 次';
  document.getElementById('totalViews').textContent = totalCount.toLocaleString() + ' 次';
}

// 搜尋檢索過濾
const searchInput = document.getElementById('searchInput');
const btnClearSearch = document.getElementById('btnClearSearch');

searchInput.addEventListener('input', (e) => {
  const kw = e.target.value.trim().toLowerCase();
  btnClearSearch.style.display = kw ? 'block' : 'none';

  if (!kw) {
    renderArchiveGrid(allBriefs, false);
    return;
  }

  const filtered = allBriefs.filter(item => {
    const inTitle = (item.title || '').toLowerCase().includes(kw);
    const inDesc = (item.summary || '').toLowerCase().includes(kw);
    const inDate = (item.date || '').toLowerCase().includes(kw);
    const inDisp = (item.display_date || '').toLowerCase().includes(kw);
    const inTags = (item.tags || []).some(t => t.toLowerCase().includes(kw));
    return inTitle || inDesc || inDate || inDisp || inTags;
  });

  renderArchiveGrid(filtered, true);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  renderArchiveGrid(allBriefs, false);
});

// Google Doc 站內預覽 Modal 控制
const previewModal = document.getElementById('previewModal');
const previewIframe = document.getElementById('previewIframe');
const iframeLoading = document.getElementById('iframeLoading');
const modalTitle = document.getElementById('modalTitle');
const modalExternalLink = document.getElementById('modalExternalLink');
const btnCloseModal = document.getElementById('btnCloseModal');

function openPreviewModal(title, url) {
  if (!url || url === '#' || url.trim() === '') {
    showToast('📝 今日 VIP 盤後分析報告正在撰寫整理中，請稍候片刻！');
    return;
  }
  modalTitle.textContent = title;
  modalExternalLink.href = url;
  
  const embedUrl = getEmbedUrl(url);
  iframeLoading.style.display = 'flex';
  previewIframe.src = embedUrl;

  previewIframe.onload = () => {
    iframeLoading.style.display = 'none';
  };

  previewModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
  previewModal.classList.remove('active');
  previewIframe.src = '';
  document.body.style.overflow = '';
}

btnCloseModal.onclick = closePreviewModal;
previewModal.onclick = (e) => {
  if (e.target === previewModal) {
    closePreviewModal();
  }
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewModal.classList.contains('active')) {
    closePreviewModal();
  }
});

// 複製連結輔助函式
function copyToClipboard(text, successMsg = '已複製連結到剪貼簿！') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    });
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (err) {
      alert('複製失敗，請手動複製網址');
    }
    document.body.removeChild(textarea);
  }
}

// 智能分享函式（手機優先呼叫原生分享面版，桌機複製連結）
function shareBrief(item) {
  const targetItem = item || latestBrief;
  const shareTitle = targetItem ? targetItem.title : '每日台股盤後快訊';
  const shareText = `【${targetItem ? targetItem.display_date : '今日'} 盤後快訊】台股大盤、三大法人買賣超與個股關鍵價分析：`;
  const shareUrl = window.location.href;

  if (navigator.share) {
    navigator.share({
      title: shareTitle,
      text: shareText,
      url: shareUrl
    }).catch(() => {});
  } else {
    copyToClipboard(shareUrl, '已複製網站連結！可直接貼在 LINE 分享給好友');
  }
}

// 站點分享按鈕
document.getElementById('btnCopySiteUrl').onclick = () => {
  shareBrief(latestBrief);
};

// Toast 提示框
function showToast(msg) {
  const toast = document.getElementById('toastMessage');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// 網頁啟動

// ========================================================
// 📅 重大行事曆與頁面分頁切換邏輯 (Calendar & Nav Logic)
// ========================================================

let calendarData = null;

let snapshot3MData = null;
let current3MFilter = 'all'; // 'all', 'high', 'low'
let current3MSearch = '';

function switchView(viewName) {
  const briefsView = document.getElementById('briefsView');
  const calendarView = document.getElementById('calendarView');
  const snapshot3MView = document.getElementById('snapshot3MView');

  const navTabBriefs = document.getElementById('navTabBriefs');
  const navTab3M = document.getElementById('navTab3M');
  const navTabCalendar = document.getElementById('navTabCalendar');

  const mTabBriefs = document.getElementById('mTabBriefs');
  const mTab3M = document.getElementById('mTab3M');
  const mTabCalendar = document.getElementById('mTabCalendar');

  // 清除所有 Tab active 狀態
  [navTabBriefs, navTab3M, navTabCalendar].forEach(b => b && b.classList.remove('active'));
  [mTabBriefs, mTab3M, mTabCalendar].forEach(b => b && b.classList.remove('active'));

  // 隱藏所有視圖
  if (briefsView) briefsView.style.display = 'none';
  if (calendarView) calendarView.style.display = 'none';
  if (snapshot3MView) snapshot3MView.style.display = 'none';

  if (viewName === 'calendar') {
    if (calendarView) calendarView.style.display = 'flex';
    if (navTabCalendar) navTabCalendar.classList.add('active');
    if (mTabCalendar) mTabCalendar.classList.add('active');

    window.location.hash = '#calendar';
    loadCalendar();
  } else if (viewName === '3m') {
    if (snapshot3MView) snapshot3MView.style.display = 'block';
    if (navTab3M) navTab3M.classList.add('active');
    if (mTab3M) mTab3M.classList.add('active');

    window.location.hash = '#3m';
    loadSnapshot3M();
  } else {
    if (briefsView) briefsView.style.display = 'flex';
    if (navTabBriefs) navTabBriefs.classList.add('active');
    if (mTabBriefs) mTabBriefs.classList.add('active');

    window.location.hash = '#briefs';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 載入與渲染 3M 新高新低即時抓取快照
async function loadSnapshot3M() {
  if (!snapshot3MData) {
    try {
      const res = await fetch('data/snapshot_3m.json?v=' + Date.now());
      if (res.ok) {
        snapshot3MData = await res.json();
      }
    } catch (err) {
      console.error('載入 snapshot_3m.json 失敗:', err);
    }
  }

  if (snapshot3MData) {
    renderSnapshot3M(snapshot3MData);
    initSnapshotFilterListeners();
  }
}

function renderSnapshot3M(data) {
  if (!data) return;

  const snapDateEl = document.getElementById('snapDate');
  if (snapDateEl && data.date) snapDateEl.textContent = data.date;

  const snapDateMobile = document.getElementById('snapDateMobile');
  if (snapDateMobile && data.date) snapDateMobile.textContent = data.date;

  const totalEl = document.getElementById('snapTotalCount');
  if (totalEl) totalEl.textContent = data.total_count;

  const highEl = document.getElementById('snapHighCount');
  if (highEl) highEl.textContent = data.high_count;

  const lowEl = document.getElementById('snapLowCount');
  if (lowEl) lowEl.textContent = data.low_count;

  const pAll = document.getElementById('pillCountAll');
  if (pAll) pAll.textContent = data.total_count;

  const pHigh = document.getElementById('pillCountHigh');
  if (pHigh) pHigh.textContent = data.high_count;

  const pLow = document.getElementById('pillCountLow');
  if (pLow) pLow.textContent = data.low_count;

  applySnapshotTableFilter();
}

function applySnapshotTableFilter() {
  if (!snapshot3MData || !snapshot3MData.stocks) return;

  const tbody = document.getElementById('snapshotTableBody');
  const emptyMsg = document.getElementById('snapEmptyMsg');
  if (!tbody) return;

  const searchKeyword = (current3MSearch || '').trim().toLowerCase();

  const filtered = snapshot3MData.stocks.filter(item => {
    // 依方向篩選：紅K = 創新高，黑K = 創新低
    if (current3MFilter === 'high' && item.direction !== '紅K') return false;
    if (current3MFilter === 'low' && item.direction !== '黑K') return false;

    // 依搜尋關鍵字篩選
    if (searchKeyword) {
      const matchCode = item.code.toLowerCase().includes(searchKeyword);
      const matchName = item.name.toLowerCase().includes(searchKeyword);
      const matchMkt = item.market.toLowerCase().includes(searchKeyword);
      if (!matchCode && !matchName && !matchMkt) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  // 金融 App 雙層 3 欄制：標的 (名稱 / 代號·市場), 觸發價, 關鍵價位
  tbody.innerHTML = filtered.map(s => {
    const isHigh = s.direction === '紅K';
    const priceClass = isHigh ? 'price-high' : 'price-low';
    return `
      <tr>
        <td>
          <div class="stock-target-cell">
            <span class="stock-name-strong">${s.name}</span>
            <div class="stock-sub-meta">
              <span class="stock-code-pill">${s.code}</span>
              <span class="stock-mkt-text">${s.market}</span>
            </div>
          </div>
        </td>
        <td class="stock-price-cell ${priceClass}">${s.price}</td>
        <td class="stock-key-cell">${s.key_price}</td>
      </tr>
    `;
  }).join('');
}

let snapshotListenersInited = false;
function initSnapshotFilterListeners() {
  if (snapshotListenersInited) return;
  snapshotListenersInited = true;

  const pills = document.querySelectorAll('.snap-pill-btn');
  pills.forEach(btn => {
    btn.addEventListener('click', () => {
      pills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current3MFilter = btn.getAttribute('data-filter') || 'all';
      applySnapshotTableFilter();
    });
  });

  const searchInput = document.getElementById('snapSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      current3MSearch = e.target.value;
      applySnapshotTableFilter();
    });
  }
}

async function loadCalendar() {
  if (calendarData) {
    renderCalendarView(calendarData);
    return;
  }
  try {
    const res = await fetch('data/calendar.json?v=' + Date.now());
    if (res.ok) {
      calendarData = await res.json();
      renderCalendarView(calendarData);
    }
  } catch (err) {
    console.error('載入 calendar.json 失敗:', err);
  }
}

function renderCalendarView(data) {
  if (!data) return;

  if (data.theme_title) {
    const tEl = document.getElementById('calThemeTitle');
    if (tEl) tEl.textContent = data.theme_title;
  }
  if (data.theme_subtitle) {
    const sEl = document.getElementById('calThemeSubtitle');
    if (sEl) sEl.textContent = data.theme_subtitle;
  }

  // 1. 渲染三大關卡時程表（智慧時態狀態標記）
  const currentDateStr = data.updated_at || '2026-11-05';
  let todayMMDD = '11/05';
  const dateMatch = currentDateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    todayMMDD = `${dateMatch[2]}/${dateMatch[3]}`;
  }

  const stagesWrap = document.getElementById('stagesContainer');
  if (stagesWrap && data.stages) {
    stagesWrap.innerHTML = data.stages.map(st => {
      // 解析日期範圍判斷狀態
      const rawDates = (st.date_range.match(/\d{1,2}\/\d{1,2}/g) || []).map(d => {
        const parts = d.split('/');
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
      });

      let stageStatus = 'upcoming';
      let statusBadgeHtml = '';
      let cardClass = 'is-upcoming';
      let tacticalPrefix = '戰術觀察：';

      if (rawDates.length > 0) {
        const minDate = rawDates[0];
        const maxDate = rawDates[rawDates.length - 1];

        if (maxDate < todayMMDD) {
          stageStatus = 'completed';
          cardClass = 'is-completed';
          statusBadgeHtml = `<span class="stage-status-badge completed"><i class="fa-solid fa-circle-check"></i> 戰果已出爐</span>`;
          tacticalPrefix = '戰果複盤：';
        } else if (todayMMDD >= minDate && todayMMDD <= maxDate) {
          stageStatus = 'active';
          cardClass = 'is-active';
          statusBadgeHtml = `<span class="stage-status-badge active"><span class="pulse-dot-red"></span> 🔥 今日焦點戰役</span>`;
          tacticalPrefix = '今日決戰前瞻：';
        } else {
          stageStatus = 'upcoming';
          cardClass = 'is-upcoming';
          statusBadgeHtml = `<span class="stage-status-badge upcoming"><i class="fa-regular fa-clock"></i> 即將登場</span>`;
          tacticalPrefix = '戰術觀察：';
        }
      }

      // 渲染內部個別事件
      const eventsHtml = (st.events || []).map(ev => {
        const evDates = (ev.tw_time.match(/\d{1,2}\/\d{1,2}/g) || []).map(d => {
          const parts = d.split('/');
          return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
        });

        let evStatusBadge = '';
        if (evDates.length > 0) {
          const evMax = evDates[evDates.length - 1];
          const evMin = evDates[0];
          if (evMax < todayMMDD) {
            evStatusBadge = `<span class="event-status-tag completed"><i class="fa-solid fa-check"></i> 已公布</span>`;
          } else if (todayMMDD >= evMin && todayMMDD <= evMax) {
            evStatusBadge = `<span class="event-status-tag active"><i class="fa-solid fa-fire"></i> 今晚重磅</span>`;
          } else {
            evStatusBadge = `<span class="event-status-tag upcoming"><i class="fa-regular fa-clock"></i> 倒數決戰</span>`;
          }
        }

        return `
          <div class="stage-event-pill">
            <div class="event-header-row">
              <span class="event-name">${ev.name}</span>
              <div style="display: flex; gap: 6px; align-items: center;">
                ${evStatusBadge}
                <span class="event-tag-pill">${ev.tag || ev.timing || ''}</span>
              </div>
            </div>
            <div class="event-time-badge">
              <i class="fa-solid fa-bell"></i> ${ev.tw_time}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="stage-card ${cardClass}">
          <div class="stage-card-header">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="stage-num-badge ${st.badge_color || 'purple'}">
                <i class="fa-solid fa-flag-checkered"></i> ${st.stage_number}
              </span>
              <span class="stage-tag-badge">${st.badge || ''}</span>
              ${statusBadgeHtml}
            </div>
            <span class="stage-date-text">
              <i class="fa-regular fa-calendar"></i> ${st.date_range}
            </span>
          </div>

          <h3 class="stage-main-title">${st.title}</h3>

          <div class="stage-events-list">
            ${eventsHtml}
          </div>

          <div class="tactical-box ${cardClass}">
            <div class="tactical-icon">
              <i class="fa-solid ${stageStatus === 'completed' ? 'fa-square-check' : 'fa-crosshairs'}"></i>
            </div>
            <div class="tactical-content">
              <span class="tactical-label">${tacticalPrefix}</span>
              ${st.tactical_observation}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. 渲染六大宏觀經濟變數
  const macroWrap = document.getElementById('macroPillarsContainer');
  if (macroWrap && data.macro_pillars) {
    macroWrap.innerHTML = data.macro_pillars.map(p => `
      <div class="macro-card">
        <div class="macro-icon-box ${p.color || 'blue'}">
          <i class="fa-solid ${p.icon || 'fa-chart-pie'}"></i>
        </div>
        <div class="macro-info">
          <h3>${p.title}</h3>
          <p>${p.desc}</p>
        </div>
      </div>
    `).join('');
  }

  // 3. 渲染對台股傳導效應專題
  const twWrap = document.getElementById('taiwanImpactSection');
  if (twWrap && data.taiwan_market_impact) {
    const imp = data.taiwan_market_impact;
    twWrap.innerHTML = `
      <div class="taiwan-impact-card">
        <div class="taiwan-impact-header">
          <i class="fa-solid fa-network-wired"></i>
          <span>${imp.title}</span>
        </div>
        <ul class="taiwan-impact-list">
          ${(imp.points || []).map(pt => `<li>${pt}</li>`).join('')}
        </ul>
      </div>
    `;
  }
}

function initNavigation() {
  const navTabBriefs = document.getElementById('navTabBriefs');
  const navTab3M = document.getElementById('navTab3M');
  const navTabCalendar = document.getElementById('navTabCalendar');

  const mTabBriefs = document.getElementById('mTabBriefs');
  const mTab3M = document.getElementById('mTab3M');
  const mTabCalendar = document.getElementById('mTabCalendar');

  if (navTabBriefs) navTabBriefs.addEventListener('click', () => switchView('briefs'));
  if (navTab3M) navTab3M.addEventListener('click', () => switchView('3m'));
  if (navTabCalendar) navTabCalendar.addEventListener('click', () => switchView('calendar'));

  if (mTabBriefs) mTabBriefs.addEventListener('click', () => switchView('briefs'));
  if (mTab3M) mTab3M.addEventListener('click', () => switchView('3m'));
  if (mTabCalendar) mTabCalendar.addEventListener('click', () => switchView('calendar'));

  // 檢查網址列 hash
  if (window.location.hash === '#calendar') {
    switchView('calendar');
  } else if (window.location.hash === '#3m') {
    switchView('3m');
  }
}

// 網頁啟動
document.addEventListener('DOMContentLoaded', () => {
  loadBriefs();
  initNavigation();
});

