// 預設備份資料（當使用者以本地 file:// 協定開啟而受限 CORS 時保證畫面依然完美呈現）
const DEFAULT_BRIEFS = [
  {
    "id": "2026-10-30",
    "date": "2026-10-30",
    "display_date": "10/30 (五)",
    "title": "1030 盤後快訊 - 台股震盪洗盤，個股關鍵轉折與籌碼追蹤",
    "url": "https://docs.google.com/document/d/13GqOpNwY3p51QzbpfmyvBEAc0dNuVeUY7cRVlu0U42A/edit?usp=sharing",
    "summary": "分析大盤技術線型走勢、重點權值股動態、多空關鍵防守價位及進出場停損停利點解析。",
    "tags": ["大盤解析", "關鍵價位", "進出場策略", "熱門焦點股"],
    "is_latest": true
  },
  {
    "id": "2026-10-29",
    "date": "2026-10-29",
    "display_date": "10/29 (四)",
    "title": "1029 盤後快訊 - 盤勢高檔整理，中小型股輪動加劇",
    "url": "https://docs.google.com/document/d/13GqOpNwY3p51QzbpfmyvBEAc0dNuVeUY7cRVlu0U42A/edit?usp=sharing",
    "summary": "關注族群輪動節奏，檢視 3 個月新高新低族群變動與主力籌碼換手跡象。",
    "tags": ["族群輪動", "波段操作", "籌碼換手"],
    "is_latest": false
  },
  {
    "id": "2026-10-28",
    "date": "2026-10-28",
    "display_date": "10/28 (三)",
    "title": "1028 盤後快訊 - 關鍵支撐測底，短線反彈觀察指標",
    "url": "https://docs.google.com/document/d/13GqOpNwY3p51QzbpfmyvBEAc0dNuVeUY7cRVlu0U42A/edit?usp=sharing",
    "summary": "回測月季線支撐力道，短線乖離修正後的低接策略與風險控管原則。",
    "tags": ["技術支撐", "低接策略", "風險控管"],
    "is_latest": false
  }
];

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
      allBriefs = DEFAULT_BRIEFS;
    }
  } catch (err) {
    console.log('[INFO] 使用預設資料庫載入:', err);
    allBriefs = DEFAULT_BRIEFS;
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

  // 站內預覽按鈕
  document.getElementById('btnPreviewDoc').onclick = () => {
    openPreviewModal(item.title, item.url);
  };

  // 複製單篇連結
  document.getElementById('btnCopyDocLink').onclick = () => {
    copyToClipboard(item.url, `已複製「${item.display_date} 盤後快訊」的 Google Doc 連結！`);
  };
}

// 渲染歷史歸檔列表
function renderArchiveGrid(list) {
  const grid = document.getElementById('archiveGrid');
  grid.innerHTML = '';

  if (!list || list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-file-circle-question"></i>
        <h3>找不到符合的快訊紀錄</h3>
        <p>請嘗試更換搜尋關鍵字或清除搜尋框</p>
      </div>
    `;
    return;
  }

  list.forEach(item => {
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

// 統計資訊更新
function updateStatsHeader() {
  if (latestBrief) {
    document.getElementById('latestUpdateDate').textContent = latestBrief.display_date || latestBrief.date;
  }
  initCounter();
}

// 訪客計數器（整合 CounterAPI 與優雅在地降級備援）
async function initCounter() {
  const NAMESPACE = 'jwood-stock-brief';
  const todayKey = 'views_' + new Date().toISOString().slice(0, 10);
  
  let todayCount = parseInt(localStorage.getItem(todayKey) || '12', 10) + 1;
  let totalCount = parseInt(localStorage.getItem('total_views') || '380', 10) + 1;
  localStorage.setItem(todayKey, todayCount);
  localStorage.setItem('total_views', totalCount);

  // 嘗試透過無伺服器計數 API 同步真實全域數字
  try {
    const res = await fetch(`https://api.counterapi.dev/v1/${NAMESPACE}/visits/up`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.count) {
        totalCount = data.count + 240; // 基礎基數展示
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
    renderArchiveGrid(allBriefs);
    return;
  }

  const filtered = allBriefs.filter(item => {
    const inTitle = (item.title || '').toLowerCase().includes(kw);
    const inDesc = (item.summary || '').toLowerCase().includes(kw);
    const inDate = (item.date || '').toLowerCase().includes(kw);
    const inTags = (item.tags || []).some(t => t.toLowerCase().includes(kw));
    return inTitle || inDesc || inDate || inTags;
  });

  renderArchiveGrid(filtered);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  renderArchiveGrid(allBriefs);
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
    // 降級作法
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

// 站點分享按鈕
document.getElementById('btnCopySiteUrl').onclick = () => {
  copyToClipboard(window.location.href, '已複製「每日台股盤後快訊」網站連結！可直接貼在 LINE 分享給朋友');
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
