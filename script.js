let allPapers = [];
let currentBoard = "IAI";
let currentSubject = "";
let currentYear = "";
let currentMonth = "";

// State
let currentLayout = "split";
let blindSolveActive = true;
let activeMobileTab = "qp"; // 'qp' or 'sol'

const STORAGE_STATE_KEY = "actuary_hub_saved_session_state";
const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// DOM Elements
const qpFrame = document.getElementById("qpFrame");
const solFrame = document.getElementById("solFrame");
const qpEmpty = document.getElementById("qpEmpty");
const solEmpty = document.getElementById("solEmpty");
const paneQP = document.getElementById("paneQP");
const paneSOL = document.getElementById("paneSOL");
const centerDivider = document.getElementById("centerDivider");

const btnIAI = document.getElementById("btnIAI");
const btnIFOA = document.getElementById("btnIFOA");
const subjectDropdown = document.getElementById("subjectDropdown");
const dropdownTrigger = document.getElementById("dropdownTrigger");
const selectedSubjectSpan = document.getElementById("selectedSubject");
const dropdownMenu = document.getElementById("dropdownMenu");
const progressText = document.getElementById("progressText");
const sessionBar = document.getElementById("sessionBar");

// Mobile Elements
const tabMobileQP = document.getElementById("tabMobileQP");
const tabMobileSOL = document.getElementById("tabMobileSOL");

// Blind Solve
const blindMask = document.getElementById("blindMask");
const btnToggleBlind = document.getElementById("btnToggleBlind");
const btnRevealSolution = document.getElementById("btnRevealSolution");

// Drawer Elements
const notesDrawer = document.getElementById("notesDrawer");
const btnToggleNotes = document.getElementById("btnToggleNotes");
const btnCloseNotes = document.getElementById("btnCloseNotes");
const sessionNotes = document.getElementById("sessionNotes");
const notesTitle = document.getElementById("notesTitle");

// Viewport Tools
const btnPopoutQP = document.getElementById("btnPopoutQP");
const btnDownloadQP = document.getElementById("btnDownloadQP");
const btnPopoutSOL = document.getElementById("btnPopoutSOL");
const btnDownloadSOL = document.getElementById("btnDownloadSOL");

// ----------------------------------------------------
// Persistent State Management
// ----------------------------------------------------
function saveCurrentState() {
  const state = {
    board: currentBoard,
    subject: currentSubject,
    year: currentYear,
    month: currentMonth,
    mobileTab: activeMobileTab
  };
  localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------
// Application Initialization
// ----------------------------------------------------
async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  try {
    const res = await fetch("./iai_papers.json");
    if (res.ok) {
      allPapers = await res.json();
    }
  } catch (err) {
    console.error("Could not load iai_papers.json:", err);
  }

  // Restore saved state if exists
  const saved = loadSavedState();
  if (saved && saved.board) {
    currentBoard = saved.board;
    currentSubject = saved.subject || "";
    currentYear = saved.year || "";
    currentMonth = saved.month || "";
    if (saved.mobileTab) activeMobileTab = saved.mobileTab;
  }

  // Sync Board buttons
  if (currentBoard === "IFOA") {
    btnIFOA.classList.add("active");
    btnIAI.classList.remove("active");
  } else {
    btnIAI.classList.add("active");
    btnIFOA.classList.remove("active");
  }

  // Session Bar Wheel Scroll
  sessionBar.addEventListener("wheel", (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      sessionBar.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  setupMobileTabs();
  populateSubjects();
  setupDrawersAndTools();
}

// ----------------------------------------------------
// Mobile Phone Tabs Switching Logic
// ----------------------------------------------------
function setupMobileTabs() {
  function switchMobileTab(target) {
    activeMobileTab = target;
    if (target === "qp") {
      tabMobileQP.classList.add("active");
      tabMobileSOL.classList.remove("active");
      paneQP.classList.add("active-mobile-pane");
      paneSOL.classList.remove("active-mobile-pane");
    } else {
      tabMobileSOL.classList.add("active");
      tabMobileQP.classList.remove("active");
      paneSOL.classList.add("active-mobile-pane");
      paneQP.classList.remove("active-mobile-pane");
    }
    saveCurrentState();
  }

  tabMobileQP.addEventListener("click", () => switchMobileTab("qp"));
  tabMobileSOL.addEventListener("click", () => switchMobileTab("sol"));

  // Apply initial mobile view
  switchMobileTab(activeMobileTab);
}

// ----------------------------------------------------
// Subject Dropdown
// ----------------------------------------------------
dropdownTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdownMenu.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!subjectDropdown.contains(e.target)) {
    dropdownMenu.classList.remove("open");
  }
});

function populateSubjects() {
  const boardPapers = allPapers.filter(p => p.board === currentBoard);
  const subjects = [...new Set(boardPapers.map(p => p.subjectCode))].sort();

  dropdownMenu.innerHTML = "";

  subjects.forEach(sub => {
    const item = document.createElement("div");
    item.className = `dropdown-item ${sub === currentSubject ? "active" : ""}`;
    item.textContent = sub;

    item.addEventListener("click", () => {
      currentSubject = sub;
      selectedSubjectSpan.textContent = sub;
      currentYear = "";
      currentMonth = "";
      dropdownMenu.classList.remove("open");

      document.querySelectorAll(".dropdown-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");

      renderSessionBar();
      saveCurrentState();
    });

    dropdownMenu.appendChild(item);
  });

  if (subjects.length > 0) {
    if (!currentSubject || !subjects.includes(currentSubject)) {
      currentSubject = subjects[0];
    }
    selectedSubjectSpan.textContent = currentSubject;
    renderSessionBar();
  } else {
    currentSubject = "";
    selectedSubjectSpan.textContent = "—";
    sessionBar.innerHTML = "";
    clearViewports();
  }
}

// ----------------------------------------------------
// Conquered Papers Tracker Logic
// ----------------------------------------------------
function getConqueredStorageKey() {
  return `conquered_${currentBoard}_${currentSubject}`;
}

function getConqueredList() {
  const data = localStorage.getItem(getConqueredStorageKey());
  return data ? JSON.parse(data) : [];
}

function togglePaperConquered(year, month) {
  const key = `${year}_${month}`;
  let list = getConqueredList();
  if (list.includes(key)) {
    list = list.filter(k => k !== key);
  } else {
    list.push(key);
  }
  localStorage.setItem(getConqueredStorageKey(), JSON.stringify(list));
  updateProgressBadge();
}

function updateProgressBadge() {
  const papers = allPapers.filter(p => p.board === currentBoard && p.subjectCode === currentSubject);
  const total = papers.length;
  const list = getConqueredList();
  const solved = list.length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
  progressText.textContent = `${solved} / ${total} Solved (${pct}%)`;
}

// ----------------------------------------------------
// Session Pills Rendering
// ----------------------------------------------------
function renderSessionBar() {
  sessionBar.innerHTML = "";

  const papers = allPapers.filter(
    p => p.board === currentBoard && p.subjectCode === currentSubject
  );

  const groups = {};
  papers.forEach(p => {
    if (!groups[p.year]) groups[p.year] = new Set();
    groups[p.year].add(p.month);
  });

  const sortedYears = Object.keys(groups).sort((a, b) => b - a);

  if (sortedYears.length > 0) {
    // If saved year/month don't match this subject, pick the latest
    if (!currentYear || !groups[currentYear] || !groups[currentYear].has(currentMonth)) {
      currentYear = sortedYears[0];
      const sortedMonths = Array.from(groups[currentYear]).sort(
        (a, b) => MONTH_ORDER.indexOf(b) - MONTH_ORDER.indexOf(a)
      );
      currentMonth = sortedMonths[0];
    }
  }

  const conqueredList = getConqueredList();

  sortedYears.forEach(year => {
    const groupEl = document.createElement("div");
    groupEl.className = "year-month-group";

    const label = document.createElement("span");
    label.className = "group-year-label";
    label.textContent = year;
    groupEl.appendChild(label);

    const months = Array.from(groups[year]).sort(
      (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
    );

    months.forEach(month => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "month-chip";
      chip.textContent = month;

      const isConquered = conqueredList.includes(`${year}_${month}`);
      if (isConquered) {
        chip.classList.add("conquered");
      }

      const isActive = String(currentYear) === String(year) && currentMonth.toLowerCase() === month.toLowerCase();
      if (isActive) {
        chip.classList.add("active");
        setTimeout(() => chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 50);
      }

      // Tap / Click to select session
      chip.addEventListener("click", () => {
        currentYear = year;
        currentMonth = month;
        renderSessionBar();
        loadViewer();
        saveCurrentState();
      });

      // Double-tap or right click marks conquered
      chip.addEventListener("dblclick", (e) => {
        e.preventDefault();
        togglePaperConquered(year, month);
        renderSessionBar();
      });
      chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        togglePaperConquered(year, month);
        renderSessionBar();
      });

      groupEl.appendChild(chip);
    });

    sessionBar.appendChild(groupEl);
  });

  updateProgressBadge();
  loadViewer();
  loadSavedNotes();
  saveCurrentState();
}

function getCurrentPaper() {
  return allPapers.find(
    p => p.board === currentBoard &&
         p.subjectCode === currentSubject &&
         String(p.year) === String(currentYear) &&
         p.month.toLowerCase() === currentMonth.toLowerCase()
  );
}

function loadViewer() {
  const paper = getCurrentPaper();

  blindSolveActive = true;
  blindMask.classList.remove("hidden");
  btnToggleBlind.textContent = "👁 Reveal";

  if (paper && paper.questionUrl) {
    qpFrame.src = `${paper.questionUrl}#toolbar=0&navpanes=0`;
    qpEmpty.style.display = "none";
  } else {
    qpFrame.src = "";
    qpEmpty.style.display = "flex";
  }

  if (paper && paper.solutionUrl) {
    solFrame.src = `${paper.solutionUrl}#toolbar=0&navpanes=0`;
    solEmpty.style.display = "none";
  } else {
    solFrame.src = "";
    solEmpty.style.display = "flex";
  }
}

function clearViewports() {
  qpFrame.src = "";
  solFrame.src = "";
  qpEmpty.style.display = "flex";
  solEmpty.style.display = "flex";
}

// ----------------------------------------------------
// Drawers & Utilities
// ----------------------------------------------------
function setupDrawersAndTools() {
  btnRevealSolution.addEventListener("click", () => {
    blindSolveActive = false;
    blindMask.classList.add("hidden");
    btnToggleBlind.textContent = "🔒 Hide";
  });

  btnToggleBlind.addEventListener("click", () => {
    blindSolveActive = !blindSolveActive;
    if (blindSolveActive) {
      blindMask.classList.remove("hidden");
      btnToggleBlind.textContent = "👁 Reveal";
    } else {
      blindMask.classList.add("hidden");
      btnToggleBlind.textContent = "🔒 Hide";
    }
  });

  btnToggleNotes.addEventListener("click", () => {
    notesDrawer.classList.toggle("hidden-drawer");
    if (!notesDrawer.classList.contains("hidden-drawer")) {
      sessionNotes.focus();
    }
  });
  btnCloseNotes.addEventListener("click", () => notesDrawer.classList.add("hidden-drawer"));

  sessionNotes.addEventListener("input", () => {
    const key = `notes_${currentBoard}_${currentSubject}_${currentYear}_${currentMonth}`;
    localStorage.setItem(key, sessionNotes.value);
  });

  function downloadFile(url, filename) {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  btnPopoutQP.addEventListener("click", () => {
    const p = getCurrentPaper();
    if (p && p.questionUrl) window.open(p.questionUrl, "_blank");
  });

  btnDownloadQP.addEventListener("click", () => {
    const p = getCurrentPaper();
    if (p && p.questionUrl) {
      downloadFile(p.questionUrl, `${currentBoard}_${currentSubject}_${currentYear}_${currentMonth}_QP.pdf`);
    }
  });

  btnPopoutSOL.addEventListener("click", () => {
    const p = getCurrentPaper();
    if (p && p.solutionUrl) window.open(p.solutionUrl, "_blank");
  });

  btnDownloadSOL.addEventListener("click", () => {
    const p = getCurrentPaper();
    if (p && p.solutionUrl) {
      downloadFile(p.solutionUrl, `${currentBoard}_${currentSubject}_${currentYear}_${currentMonth}_SOL.pdf`);
    }
  });
}

function loadSavedNotes() {
  notesTitle.textContent = `${currentSubject} ${currentMonth} ${currentYear} Notes`;
  const key = `notes_${currentBoard}_${currentSubject}_${currentYear}_${currentMonth}`;
  sessionNotes.value = localStorage.getItem(key) || "";
}

// ----------------------------------------------------
// Board Switchers
// ----------------------------------------------------
btnIAI.addEventListener("click", () => {
  if (currentBoard !== "IAI") {
    currentBoard = "IAI";
    btnIAI.classList.add("active");
    btnIFOA.classList.remove("active");
    populateSubjects();
    saveCurrentState();
  }
});

btnIFOA.addEventListener("click", () => {
  if (currentBoard !== "IFOA") {
    currentBoard = "IFOA";
    btnIFOA.classList.add("active");
    btnIAI.classList.remove("active");
    populateSubjects();
    saveCurrentState();
  }
});

init();