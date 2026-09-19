// --- State Management ---
const boardDataCache = {
  IAI: null,
  IFOA: null
};

const BOARD_FILE_MAP = {
  IAI: './iai_papers.json',
  IFOA: './ifoa_papers.json'
};

let activeBoard = 'IAI';
let activeSubject = null;
let activeYear = null;
let activeMonth = null;

// --- Elements ---
const leftFrame = document.getElementById('leftFrame');
const rightFrame = document.getElementById('rightFrame');
const leftEmptyNotice = document.getElementById('leftEmptyNotice');
const rightEmptyNotice = document.getElementById('rightEmptyNotice');

const dockBoardLabel = document.getElementById('dockBoardLabel');
const dockSubjectLabel = document.getElementById('dockSubjectLabel');
const dockYearLabel = document.getElementById('dockYearLabel');
const dockMonthLabel = document.getElementById('dockMonthLabel');

const boardToggleBtn = document.getElementById('boardToggleBtn');
const subjectToggleBtn = document.getElementById('subjectToggleBtn');
const yearToggleBtn = document.getElementById('yearToggleBtn');
const monthToggleBtn = document.getElementById('monthToggleBtn');

const boardPopover = document.getElementById('boardPopover');
const subjectPopover = document.getElementById('subjectPopover');
const yearPopover = document.getElementById('yearPopover');
const monthPopover = document.getElementById('monthPopover');

const movableDock = document.getElementById('movableDock');
const dragGrip = document.getElementById('dragGrip');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupDraggableDock();
  await loadBoardData(activeBoard);
});

// --- Dynamic Data Fetching ---
async function loadBoardData(board) {
  if (boardDataCache[board]) {
    initializeState();
    return;
  }

  const filePath = BOARD_FILE_MAP[board];
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    boardDataCache[board] = await res.json();
  } catch (err) {
    console.error(`Error loading ${board} papers:`, err);
    boardDataCache[board] = [];
  }

  initializeState();
}

function initializeState() {
  const subjects = getSubjects();
  if (subjects.length > 0) {
    activeSubject = subjects[0];
    const years = getYears();
    activeYear = years.length > 0 ? years[0] : null;
    const months = getMonths();
    activeMonth = months.length > 0 ? months[0] : null;
  } else {
    activeSubject = null;
    activeYear = null;
    activeMonth = null;
  }

  updateLabels();
  loadActivePaper();
}

// --- Data Queries ---
function getCurrentData() {
  return boardDataCache[activeBoard] || [];
}

function getSubjects() {
  const subjects = getCurrentData().map((p) => p.subjectCode);
  return [...new Set(subjects)];
}

function getYears() {
  const papers = getCurrentData().filter(
    (p) => p.subjectCode.toUpperCase() === (activeSubject || '').toUpperCase()
  );
  const years = papers.map((p) => String(p.year));
  return [...new Set(years)].sort((a, b) => Number(b) - Number(a));
}

function getMonths() {
  const papers = getCurrentData().filter(
    (p) =>
      p.subjectCode.toUpperCase() === (activeSubject || '').toUpperCase() &&
      String(p.year) === String(activeYear || '')
  );
  const months = papers.map((p) => p.month);
  return [...new Set(months)];
}

// --- UI Label Updating ---
function updateLabels() {
  dockBoardLabel.textContent = activeBoard;
  dockSubjectLabel.textContent = activeSubject || 'SUB';
  dockYearLabel.textContent = activeYear || 'YEAR';
  dockMonthLabel.textContent = activeMonth || 'MONTH';
}

// --- Document Viewer Rendering ---
function loadActivePaper() {
  if (!activeSubject || !activeYear || !activeMonth) {
    resetViewer();
    return;
  }

  const paper = getCurrentData().find(
    (p) =>
      p.subjectCode.toUpperCase() === activeSubject.toUpperCase() &&
      String(p.year) === String(activeYear) &&
      p.month.toLowerCase() === activeMonth.toLowerCase()
  );

  if (!paper) {
    resetViewer();
    return;
  }

  // Load Solution (Left)
  if (paper.solutionUrl) {
    leftFrame.src = paper.solutionUrl;
    leftFrame.style.display = 'block';
    leftEmptyNotice.style.display = 'none';
  } else {
    resetLeftPane();
  }

  // Load Question (Right)
  if (paper.questionUrl) {
    rightFrame.src = paper.questionUrl;
    rightFrame.style.display = 'block';
    rightEmptyNotice.style.display = 'none';
  } else {
    resetRightPane();
  }
}

function resetLeftPane() {
  leftFrame.removeAttribute('src');
  leftFrame.style.display = 'none';
  leftEmptyNotice.style.display = 'flex';
}

function resetRightPane() {
  rightFrame.removeAttribute('src');
  rightFrame.style.display = 'none';
  rightEmptyNotice.style.display = 'flex';
}

function resetViewer() {
  resetLeftPane();
  resetRightPane();
}

// --- Popover Renderers ---
function renderSubjectPopover() {
  subjectPopover.innerHTML = '';
  const subjects = getSubjects();

  if (subjects.length === 0) {
    subjectPopover.innerHTML = '<div class="dock-popover-item">None</div>';
    return;
  }

  subjects.forEach((subj) => {
    const item = document.createElement('div');
    item.className = 'dock-popover-item';
    if (activeSubject === subj) item.classList.add('active');
    item.textContent = subj;
    item.onclick = (e) => {
      e.stopPropagation();
      activeSubject = subj;
      const years = getYears();
      activeYear = years.length > 0 ? years[0] : null;
      const months = getMonths();
      activeMonth = months.length > 0 ? months[0] : null;
      updateLabels();
      loadActivePaper();
      closeAllPopovers();
    };
    subjectPopover.appendChild(item);
  });
}

function renderYearPopover() {
  yearPopover.innerHTML = '';
  const years = getYears();

  if (years.length === 0) {
    yearPopover.innerHTML = '<div class="dock-popover-item">None</div>';
    return;
  }

  years.forEach((yr) => {
    const item = document.createElement('div');
    item.className = 'dock-popover-item';
    if (String(activeYear) === String(yr)) item.classList.add('active');
    item.textContent = yr;
    item.onclick = (e) => {
      e.stopPropagation();
      activeYear = yr;
      const months = getMonths();
      activeMonth = months.includes(activeMonth) ? activeMonth : months[0];
      updateLabels();
      loadActivePaper();
      closeAllPopovers();
    };
    yearPopover.appendChild(item);
  });
}

function renderMonthPopover() {
  monthPopover.innerHTML = '';
  const months = getMonths();

  if (months.length === 0) {
    monthPopover.innerHTML = '<div class="dock-popover-item">None</div>';
    return;
  }

  months.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'dock-popover-item';
    if (activeMonth && activeMonth.toLowerCase() === m.toLowerCase()) {
      item.classList.add('active');
    }
    item.textContent = m;
    item.onclick = (e) => {
      e.stopPropagation();
      activeMonth = m;
      updateLabels();
      loadActivePaper();
      closeAllPopovers();
    };
    monthPopover.appendChild(item);
  });
}

// --- Popover Visibility Controls ---
function closeAllPopovers() {
  boardPopover.classList.remove('show');
  subjectPopover.classList.remove('show');
  yearPopover.classList.remove('show');
  monthPopover.classList.remove('show');
}

function togglePopover(popover, renderFn) {
  const isAlreadyOpen = popover.classList.contains('show');
  closeAllPopovers();
  if (!isAlreadyOpen) {
    if (renderFn) renderFn();
    popover.classList.add('show');
  }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  boardToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(boardPopover);
  });

  boardPopover.querySelectorAll('.dock-popover-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const board = item.getAttribute('data-board');
      if (activeBoard !== board) {
        activeBoard = board;
        boardPopover.querySelectorAll('.dock-popover-item').forEach((el) => {
          el.classList.toggle('active', el.getAttribute('data-board') === board);
        });
        await loadBoardData(board);
      }
      closeAllPopovers();
    });
  });

  subjectToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(subjectPopover, renderSubjectPopover);
  });

  yearToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(yearPopover, renderYearPopover);
  });

  monthToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(monthPopover, renderMonthPopover);
  });

  window.addEventListener('click', closeAllPopovers);
}

// --- Draggable Dock Support ---
function setupDraggableDock() {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  dragGrip.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - movableDock.getBoundingClientRect().left;
    offsetY = e.clientY - movableDock.getBoundingClientRect().top;

    movableDock.style.bottom = 'auto';
    movableDock.style.right = 'auto';
    movableDock.style.transform = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;

    movableDock.style.left = `${Math.max(10, Math.min(window.innerWidth - movableDock.offsetWidth - 10, x))}px`;
    movableDock.style.top = `${Math.max(10, Math.min(window.innerHeight - movableDock.offsetHeight - 10, y))}px`;
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}