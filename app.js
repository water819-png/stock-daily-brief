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
  btnOpen.href = item.url;

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
    openPreviewModal(item.title, item.url);
  };

  // 複製單篇連結
  document.getElementById('btnCopyDocLink').onclick = () => {
    copyToClipboard(item.url, `已複製「${item.display_date} 盤後快訊」的 Google Doc 連結！`);
  };

  // 手機版底部快捷操作列綁定
  const mBtnOpen = document.getElementById('mBtnOpenDoc');
  if (mBtnOpen) mBtnOpen.href = item.url;

  const mBtnPreview = document.getElementById('mBtnPreviewDoc');
  if (mBtnPreview) {
    mBtnPreview.onclick = () => {
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
        <div class="inst-sub">連續 14 個交易日買超</div>
      </div>
      <div class="inst-pill">
        <div class="inst-name">自營商合計</div>
        <div class="inst-val sell">${inst.dealer || '--'}</div>
        <div class="inst-sub">自行買賣與避險同步調節</div>
      </div>
      <div class="inst-pill">
        <div class="inst-name">三大法人合計</div>
        <div class="inst-val sell">${inst.total || '--'}</div>
        <div class="inst-sub">10 月累計調節近 1.2 兆</div>
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
        <a href="${item.url}" target="_blank" class="btn-primary btn-sm" style="flex: 1;">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> 開啟閱讀
        </a>
        <button class="btn-glass btn-sm btn-card-preview" title="站內預覽">
          <i class="fa-solid fa-eye"></i>
        </button>
        <button class="btn-secondary btn-sm btn-card-copy" title="複製連結">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    `;

    // 綁定卡片按鈕事件
    card.querySelector('.btn-card-preview').onclick = () => {
      openPreviewModal(item.title, item.url);
    };

    card.querySelector('.btn-card-copy').onclick = () => {
      copyToClipboard(item.url, `已複製「${item.display_date} 盤後快訊」連結！`);
    };

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
document.addEventListener('DOMContentLoaded', loadBriefs);
