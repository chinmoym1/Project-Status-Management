// --- CENTRAL STATE ---
let projects = JSON.parse(localStorage.getItem("myProjects")) || [];
let activeIndex = null;
let editingTaskId = null; // null = Adding New, Value = Editing Existing
let draggedColumnIdx = null; // For column reordering

// --- 1. VIEW NAVIGATION ---
function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const target = document.getElementById(viewId);
  if (target) target.classList.remove("hidden");
  if (viewId === "project-list-view") renderProjectGrid();
}

// --- 2. PROJECT LIST DASHBOARD ---
// --- RENDER DASHBOARD (Fixed Empty State) ---
function renderProjectGrid() {
  const container = document.getElementById("project-grid");
  const instructionEl = document.getElementById("dashboard-instruction");

  // Clear previous content
  container.innerHTML = "";

  // --- CASE 1: NO PROJECTS (EMPTY STATE) ---
  if (projects.length === 0) {
    // Hide the instruction banner
    if (instructionEl) instructionEl.style.display = "none";

    // Show the "No Projects" message
    container.innerHTML = `
            <div style="text-align: center; padding: 50px 20px; color: #666;">
                <h3 style="margin-bottom: 10px;">No projects yet</h3>
                <p style="font-size: 0.95rem; color: #888;">Create your first project to get started!</p>
            </div>`;
    return; // Stop here
  }

  // --- CASE 2: PROJECTS EXIST ---
  // Show the instruction banner
  if (instructionEl) instructionEl.style.display = "block";

  // Loop through projects and create rows
  projects.forEach((proj, index) => {
    const totalTasks = proj.tasks ? proj.tasks.length : 0;

    // Calculate Progress (Safely)
    const completedStageIdx = proj.stages.length - 1;
    const completedTasks = proj.tasks
      ? proj.tasks.filter((t) => t.stageIdx === completedStageIdx).length
      : 0;

    let percent = 0;
    if (totalTasks > 0) {
      percent = Math.round((completedTasks / totalTasks) * 100);
    }

    // Format Date
    const lastUpdated = proj.lastUpdated
      ? new Date(proj.lastUpdated).toLocaleDateString()
      : "New";

    // Create the Row
    const row = document.createElement("div");
    row.className = "project-row";
    row.onclick = () => openProject(index);

    row.innerHTML = `
            <div class="row-info">
                <h3>${proj.name}</h3>
                <p class="row-desc">${proj.stages.length} Stages • ${totalTasks} Tasks</p>
            </div>

            <div class="row-progress">
                <div class="progress-label">
                    <span>Progress</span>
                    <span>${percent}%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${percent}%"></div>
                </div>
            </div>

            <div class="row-meta">
                Updated: ${lastUpdated}
            </div>

            <div class="row-actions">
                <button class="btn-delete-icon" onclick="deleteProject(event, ${index})" title="Delete Project">
                    &times;
                </button>
            </div>
        `;

    container.appendChild(row);
  });
}

// Helper to handle deletion safely
function deleteProject(e, index) {
  e.stopPropagation(); // Prevent opening the project when clicking delete

  const projName = projects[index].name;

  if (confirm(`Are you sure you want to delete the project "${projName}"?`)) {
    projects.splice(index, 1);
    saveData();
    renderProjectGrid();
  }
}

// --- MASTER FILTER & SORT ENGINE ---
function applyFilters() {
  const searchQuery = document
    .getElementById("task-search-input")
    .value.toLowerCase();
  const priorityFilter = document.getElementById("filter-priority").value;
  const sortOrder = document.getElementById("sort-order").value;

  const columns = document.querySelectorAll(".drop-zone");

  columns.forEach((col) => {
    // Get all task cards in this column
    const cards = Array.from(col.getElementsByClassName("task-item"));

    cards.forEach((card) => {
      // 1. DATA EXTRACTION
      const title = card.querySelector("h4").innerText.toLowerCase();
      const desc = card.querySelector("p").innerText.toLowerCase();

      // We need to find the Priority Badge text.
      // (Assuming your badge has class .badge-priority)
      const priorityBadge = card.querySelector(".badge-priority");
      const priorityText = priorityBadge ? priorityBadge.innerText : "Medium"; // Default

      // We need the raw data for sorting.
      // (We stored ID in the card, let's look up the task object for dates)
      const taskId = parseInt(card.id);
      const taskObj = projects[activeIndex].tasks.find((t) => t.id === taskId);

      // 2. FILTERING LOGIC (Show/Hide)
      let matchesSearch =
        title.includes(searchQuery) || desc.includes(searchQuery);
      let matchesPriority =
        priorityFilter === "all" || priorityText === priorityFilter;

      if (matchesSearch && matchesPriority) {
        card.style.display = "block";
      } else {
        card.style.display = "none";
      }

      // 3. SORTING LOGIC (Using CSS Order)
      if (taskObj) {
        let sortValue = 0;

        if (sortOrder === "newest") {
          // Higher ID = Newer = Lower CSS Order (to show first)
          sortValue = -taskObj.id;
        } else if (sortOrder === "oldest") {
          sortValue = taskObj.id;
        } else if (sortOrder === "due-soon") {
          // If no date, push to bottom (infinity)
          if (!taskObj.date) sortValue = 9999999999;
          else sortValue = new Date(taskObj.date).getTime();
        }

        // Apply CSS order to the flex/grid item
        card.style.order = sortValue;
      }
    });
  });

  // Ensure the drop-zone is display: flex for 'order' to work
  document.querySelectorAll(".drop-zone").forEach((z) => {
    z.style.display = "flex";
    z.style.flexDirection = "column";
  });
}

// --- 3. CREATE NEW PROJECT ---
function handleCreateProject() {
  const nameInput = document.getElementById("setup-name");
  const stagesInput = document.getElementById("setup-stages");
  if (!nameInput.value.trim()) return alert("Project Name is mandatory");

  // Force "New" and "Completed" stages
  const custom = stagesInput.value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const finalStages = ["New", ...custom, "Completed"];

  // Create an array of limits (default 0 means no limit)
  const initialLimits = new Array(finalStages.length).fill(0);

  projects.push({
    name: nameInput.value,
    stages: finalStages,
    limits: initialLimits, // NEW: Array matching stages index
    tasks: [],
  });
  saveData();
  nameInput.value = "";
  stagesInput.value = "";
  showView("project-list-view");
}

// --- 4. KANBAN BOARD RENDERER ---
function openProject(index) {
  activeIndex = index;
  const proj = projects[index];

  // --- SELF-HEALING DATA FIX ---
  // If this project doesn't have a 'limits' array yet, create one
  if (!proj.limits) {
    proj.limits = new Array(proj.stages.length).fill(0); // 0 = Unlimited
    saveData(); // Save this fix immediately
  }

  // Ensure we have the correct HTML element for the title
  const titleEl = document.getElementById("active-project-title");
  if (titleEl) {
    titleEl.innerText = proj.name;
    titleEl.onclick = editProjectTitle;
  }

  // Now it's safe to render
  renderBoard();
  showView("kanban-view");
}

// Close Project
function closeProject() {
  // 1. Reset Active State
  activeIndex = null;

  // 2. Clear any lingering drag/edit states
  editingTaskId = null;
  draggedColumnIdx = null;

  // 3. Return to Dashboard
  showView("project-list-view");
}

// Render Logic
// --- MAIN BOARD RENDER LOOP ---
function renderBoard() {
  const board = document.getElementById("kanban-board");
  board.innerHTML = ""; // Clear board

  // 1. Safety Checks
  if (activeIndex === null || !projects[activeIndex]) return;

  const proj = projects[activeIndex];

  // Self-healing: Create limits array if missing
  if (!proj.limits) {
    proj.limits = new Array(proj.stages.length).fill(0);
  }

  // --- LOOP THROUGH STAGES (COLUMNS) ---
  proj.stages.forEach((stage, sIdx) => {
    const col = document.createElement("div");
    col.className = "status-column";

    // A. SPECIAL STYLING: Check if it's the Last Column (Completed)
    if (sIdx === proj.stages.length - 1) {
      col.classList.add("completed-column");
    }

    // B. LIMIT LOGIC: Calculate counts
    const limit = proj.limits[sIdx] || 0;
    const currentTasks = proj.tasks.filter((t) => t.stageIdx === sIdx);
    const count = currentTasks.length;

    // Visual Warning: If limit reached, turn red
    if (limit > 0 && count >= limit) {
      col.classList.add("limit-reached");
    }

    // C. DRAG EVENTS (For moving the Column itself)
    col.draggable = true;

    col.ondragstart = (e) => {
      // Only drag if clicking header/background, not the task cards
      if (
        e.target.className.includes("status-column") ||
        e.target.className.includes("column-header")
      ) {
        draggedColumnIdx = sIdx;
        e.dataTransfer.setData("type", "column");
        // Visual feedback
        setTimeout(() => col.classList.add("dragging-col"), 0);
      }
    };

    col.ondragover = (e) => {
      e.preventDefault(); // Allow dropping
      if (draggedColumnIdx !== null && draggedColumnIdx !== sIdx) {
        col.classList.add("drag-over-col");
      }
    };

    col.ondragleave = () => col.classList.remove("drag-over-col");

    col.ondrop = (e) => handleDrop(e); // Calls our main drop handler

    col.ondragend = () => {
      col.classList.remove("dragging-col");
      document
        .querySelectorAll(".status-column")
        .forEach((c) => c.classList.remove("drag-over-col"));
      draggedColumnIdx = null;
    };

    // D. RENDER COLUMN HEADER
    col.innerHTML = `
          <div class="column-header-container">
              <h3 class="column-header" id="stage-header-${sIdx}" onclick="enableStageRename(${sIdx})">
                  ${stage}
              </h3>
              
              <span class="column-limit-display" onclick="setStageLimit(${sIdx})" title="Set Task Limit">
                  ${limit > 0 ? count + "/" + limit : count}
              </span>

              <span class="stage-delete-btn" onclick="deleteStage(${sIdx})" title="Delete Stage">&times;</span>
          </div>
          
          <div class="drop-zone" id="col-${sIdx}"></div>
      `;

    board.appendChild(col);

    // --- RENDER TASKS INSIDE THIS COLUMN ---
    const zone = col.querySelector(".drop-zone");

    currentTasks.forEach((t) => {
      const taskEl = document.createElement("div");
      taskEl.className = "task-item";
      taskEl.draggable = true;
      taskEl.id = t.id; // Important: ID is stored here for retrieval

      // 1. Task Drag Events
      taskEl.ondragstart = (e) => {
        e.stopPropagation(); // Don't drag the column
        e.dataTransfer.setData("text", t.id); // Pass Task ID
        e.dataTransfer.setData("type", "task");
      };

      // 2. Edit Event (Double Click)
      taskEl.ondblclick = (e) => {
        e.stopPropagation();
        openModalForEdit(t.id);
      };

      // 3. Generate HTML for TAGS
      // Loops through tags array and adds color classes
      const tagsHtml = (t.tags || [])
        .map((tag) => {
          const lowerTag = tag.toLowerCase();
          let tagClass = "task-tag";
          // Add specific classes for coloring
          if (lowerTag.includes("bug")) tagClass += " bug";
          else if (lowerTag.includes("feature")) tagClass += " feature";
          else if (lowerTag.includes("urgent")) tagClass += " urgent"; // Add CSS for this if you want

          return `<span class="${tagClass}">${tag}</span>`;
        })
        .join("");

      // 4. Generate HTML for PRIORITY
      const priorityClass = t.priority ? `badge-priority ${t.priority}` : "";

      // 5. Inject Task HTML
      taskEl.innerHTML = `
              <span class="task-delete-btn" onclick="deleteTask(event, ${
                t.id
              })">&times;</span>
              
              <h4>${t.title}</h4>
              <p>${t.desc}</p>
              
              <div class="tag-container">${tagsHtml}</div>

              <div class="task-badges">
                  ${
                    t.priority
                      ? `<span class="badge ${priorityClass}">${t.priority}</span>`
                      : ""
                  }
                  ${
                    t.date
                      ? `<span class="badge badge-date">📅 ${t.date}</span>`
                      : ""
                  }
              </div>
          `;

      zone.appendChild(taskEl);
    });
  });

  // --- RENDER "ADD NEW STAGE" COLUMN ---
  const addCol = document.createElement("div");
  addCol.className = "add-stage-column";
  addCol.onclick = openAddStageModal;
  addCol.title = "Add New Stage";
  addCol.innerHTML = `<span class="add-stage-btn">+</span>`;

  board.appendChild(addCol);

  // --- RE-APPLY FILTERS (OPTIONAL) ---
  // If the search bar has text, re-run the filter so items don't suddenly reappear
  const searchInput = document.getElementById("task-search-input");
  if (searchInput && searchInput.value) {
    applyFilters();
  }
}

// --- INLINE STAGE RENAMING ---
function enableStageRename(index) {
  const header = document.getElementById(`stage-header-${index}`);
  const currentName = projects[activeIndex].stages[index];

  // 1. Create an Input Element
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "stage-name-input";
  input.id = `stage-input-${index}`;

  // 2. Event Listeners for Saving
  // Save on "Enter" key
  input.onkeydown = (e) => {
    if (e.key === "Enter") saveStageName(index);
    if (e.key === "Escape") cancelRename(index, currentName);
  };

  // Save when clicking outside (Blur)
  input.onblur = () => saveStageName(index);

  // 3. Swap the H3 with the Input
  header.replaceWith(input);
  input.focus();
  // Move cursor to the end of the text
  const length = input.value.length;
  input.setSelectionRange(length, length);
}

function saveStageName(index) {
  const input = document.getElementById(`stage-input-${index}`);

  // Safety check: input might be gone if Enter + Blur fired together
  if (!input) return;

  const newName = input.value.trim();
  const proj = projects[activeIndex];

  if (newName && newName !== "") {
    // Save to data
    proj.stages[index] = newName;
    saveData();
  }

  // Re-render to turn Input back into H3
  renderBoard();
}

function cancelRename(index, oldName) {
  // Just re-render to restore the H3 with old name
  renderBoard();
}

// --- PROJECT RENAMING LOGIC ---
function editProjectTitle() {
  const titleEl = document.getElementById("active-project-title");
  const currentName = projects[activeIndex].name;

  // 1. Create large input element
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "project-title-input";
  input.id = "project-title-input"; // specific ID for saving

  // 2. Handle Save Events
  input.onkeydown = (e) => {
    if (e.key === "Enter") saveProjectTitle();
    if (e.key === "Escape") renderBoardHeader(); // Cancel
  };

  // Save on blur (clicking away)
  input.onblur = () => saveProjectTitle();

  // 3. Swap H2 with Input
  titleEl.replaceWith(input);
  input.focus();
}

function saveProjectTitle() {
  const input = document.getElementById("project-title-input");

  // Safety check if input is already removed
  if (!input) return;

  const newName = input.value.trim();

  if (newName && newName !== "") {
    // Update Data
    projects[activeIndex].name = newName;
    saveData();
  }

  // Restore the H2 (re-render the header text)
  renderBoardHeader();
}

// Helper to restore the H2 element
function renderBoardHeader() {
  const container = document.querySelector(".board-header");
  const input = document.getElementById("project-title-input");
  const currentName = projects[activeIndex].name;

  // Create the H2 again
  const h2 = document.createElement("h2");
  h2.id = "active-project-title";
  h2.onclick = editProjectTitle;
  h2.title = "Click to Rename Project";
  h2.innerText = currentName;

  // If input exists, replace it. Otherwise, just update text (fallback)
  if (input) {
    input.replaceWith(h2);
  } else {
    // Fallback for safety
    const existingH2 = document.getElementById("active-project-title");
    if (existingH2) existingH2.innerText = currentName;
  }
}

// --- SEARCH FUNCTIONALITY ---
function filterTasks() {
  // 1. Get the search query and convert to lowercase
  const input = document.getElementById("task-search-input");
  const filter = input.value.toLowerCase();

  // 2. Get all task cards on the board
  const tasks = document.querySelectorAll(".task-item");

  // 3. Loop through every task
  tasks.forEach((task) => {
    // Find the Title (h4) and Description (p) inside the card
    const titleEl = task.querySelector("h4");
    const descEl = task.querySelector("p");

    // Get text content (handle cases where element might be missing)
    const titleText = titleEl ? titleEl.innerText.toLowerCase() : "";
    const descText = descEl ? descEl.innerText.toLowerCase() : "";

    // 4. Check if query matches either Title OR Description
    if (titleText.includes(filter) || descText.includes(filter)) {
      task.style.display = ""; // Show (default)
    } else {
      task.style.display = "none"; // Hide
    }
  });
}

// Function to set limit
function setStageLimit(stageIndex) {
  const currentLimit = projects[activeIndex].limits[stageIndex] || 0;
  const newLimit = prompt(
    `Set Max Tasks for "${projects[activeIndex].stages[stageIndex]}" (0 for unlimited):`,
    currentLimit
  );

  if (newLimit !== null && !isNaN(newLimit)) {
    projects[activeIndex].limits[stageIndex] = parseInt(newLimit);
    saveData();
    renderBoard();
  }
}

// --- HELPER: CHECK STAGE LIMITS ---
function checkStageLimit(stageIndex) {
  const proj = projects[activeIndex];

  // Safety: If limits array doesn't exist yet (old projects), create it
  if (!proj.limits) {
    proj.limits = new Array(proj.stages.length).fill(0);
  }

  const limit = proj.limits[stageIndex];

  // If limit is 0 or undefined, it means "Unlimited" -> Allow action
  if (!limit || limit === 0) return true;

  // Count tasks currently in this stage
  const currentCount = proj.tasks.filter(
    (t) => t.stageIdx === stageIndex
  ).length;

  // Validation
  if (currentCount >= limit) {
    alert(
      `Stage Limit Reached! "${proj.stages[stageIndex]}" cannot accept more than ${limit} tasks.`
    );
    return false; // Action Denied
  }

  return true; // Action Allowed
}

// --- HELPER: GET TODAY'S DATE (YYYY-MM-DD) ---
function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function openModalForAdd() {
  editingTaskId = null;
  document.getElementById("modal-title-text").innerText = "Add New Card";
  document.getElementById("task-title").value = "";
  document.getElementById("task-desc").value = "";
  document.getElementById("task-tags").value = ""; // Clear tags

  // Reset Date & Priority
  const dateInput = document.getElementById("task-date");
  dateInput.value = "";
  dateInput.min = new Date().toISOString().split("T")[0]; // Disable past dates

  document.getElementById("task-priority").value = "Medium";
  document.getElementById("task-modal").classList.remove("hidden");
}

// --- 2. OPEN MODAL FOR EDITING ---
function openModalForEdit(taskId) {
  editingTaskId = taskId; // CRITICAL: Set this to the ID we are editing

  const task = projects[activeIndex].tasks.find((t) => t.id === taskId);

  if (task) {
    document.getElementById("modal-title-text").innerText = "Edit Task";
    document.getElementById("task-title").value = task.title;
    document.getElementById("task-desc").value = task.desc;

    // Load Tags: Convert Array ["Bug", "UI"] -> String "Bug, UI"
    document.getElementById("task-tags").value = (task.tags || []).join(", ");

    document.getElementById("task-date").value = task.date || "";
    document.getElementById("task-priority").value = task.priority || "Medium";

    document.getElementById("task-modal").classList.remove("hidden");
  }
}

// Called by Double Clicking a Task
// 1. Open the Modal
function openAddStageModal() {
  const modal = document.getElementById("stage-modal");
  const input = document.getElementById("new-stage-name");

  // Reset input
  input.value = "";

  // Show modal
  modal.classList.remove("hidden");

  // Focus input immediately for better UX
  setTimeout(() => input.focus(), 100);

  // Allow "Enter" to save
  input.onkeydown = (e) => {
    if (e.key === "Enter") confirmAddStage();
    if (e.key === "Escape") closeStageModal();
  };
}

// 2. Save the New Stage
function confirmAddStage() {
  const input = document.getElementById("new-stage-name");
  const stageName = input.value.trim();

  if (!stageName) {
    alert("Stage name cannot be empty!");
    input.focus(); // Keep focus on input
    return; // Stop the function here
  }
  // Add to project data
  projects[activeIndex].stages.push(stageName);

  saveData();
  renderBoard();

  // Close the modal on success
  closeStageModal();
}

// 3. CLOSE MODAL (Fixed Cancel Button)
function closeStageModal() {
  const modal = document.getElementById("stage-modal");
  modal.classList.add("hidden"); // This hides the modal
}

// Delete Stages Section
function deleteStage(index) {
  const proj = projects[activeIndex];

  // Validation: Minimum 2 stages
  if (proj.stages.length <= 2) {
    return alert("Cannot delete: Project must have at least 2 stages.");
  }

  const stageName = proj.stages[index];

  if (
    confirm(`Delete stage "${stageName}"? Tasks will move to the first column.`)
  ) {
    // 1. Move tasks safely to the first column (Index 0)
    proj.tasks.forEach((t) => {
      if (t.stageIdx === index) {
        t.stageIdx = 0;
      } else if (t.stageIdx > index) {
        t.stageIdx--; // Shift index down for tasks in later columns
      }
    });

    // 2. Remove the Stage Name
    proj.stages.splice(index, 1);

    // 3. CRITICAL FIX: Remove the Limit for this stage too
    if (proj.limits) {
      proj.limits.splice(index, 1);
    }

    saveData();
    renderBoard();
  }
}

// Helper to reorder stages and update task indices
function moveProjectStage(fromIdx, toIdx) {
  const proj = projects[activeIndex];

  // 1. Reorder the Stage Names
  const [movedStageName] = proj.stages.splice(fromIdx, 1);
  proj.stages.splice(toIdx, 0, movedStageName);

  // 2. CRITICAL FIX: Reorder the Limits to match!
  // If we don't do this, the limit stays at the old index
  if (proj.limits) {
    const [movedLimit] = proj.limits.splice(fromIdx, 1);
    proj.limits.splice(toIdx, 0, movedLimit);
  }

  // 3. Update Task Stage Indices
  // (Tasks need to know their column moved, so we shift their stageIdx)
  proj.tasks.forEach((task) => {
    if (task.stageIdx === fromIdx) {
      task.stageIdx = toIdx; // Follow the column to new spot
    } else if (
      fromIdx < toIdx &&
      task.stageIdx > fromIdx &&
      task.stageIdx <= toIdx
    ) {
      task.stageIdx--; // Shift left
    } else if (
      fromIdx > toIdx &&
      task.stageIdx < fromIdx &&
      task.stageIdx >= toIdx
    ) {
      task.stageIdx++; // Shift right
    }
  });

  saveData();
  renderBoard();
  draggedColumnIdx = null; // Reset drag state
}

function renameStage(index) {
  const newName = prompt("Rename Stage:", projects[activeIndex].stages[index]);
  if (newName) {
    projects[activeIndex].stages[index] = newName.trim();
    saveData();
    renderBoard();
  }
}

// --- HELPER: UPDATE TIMESTAMP ---
function updateTimestamp() {
  if (activeIndex !== null && projects[activeIndex]) {
    projects[activeIndex].lastUpdated = new Date().toISOString();
    saveData(); // Save to local storage
  }
}

// --- SAVE TASK (ADD OR EDIT) ---
// --- 1. OPEN MODAL FOR NEW TASK ---
function openModalForAdd() {
  editingTaskId = null; // CRITICAL: Reset this so we don't overwrite an old task

  document.getElementById("modal-title-text").innerText = "Add New Card";

  // Clear all fields
  document.getElementById("task-title").value = "";
  document.getElementById("task-desc").value = "";
  document.getElementById("task-tags").value = ""; // Clear tags

  // Reset Date & Priority
  const dateInput = document.getElementById("task-date");
  dateInput.value = "";
  dateInput.min = new Date().toISOString().split("T")[0]; // Disable past dates

  document.getElementById("task-priority").value = "Medium";

  document.getElementById("task-modal").classList.remove("hidden");
}

// --- 2. OPEN MODAL FOR EDITING ---
function openModalForEdit(taskId) {
  editingTaskId = taskId; // CRITICAL: Set this to the ID we are editing

  const task = projects[activeIndex].tasks.find((t) => t.id === taskId);

  if (task) {
    document.getElementById("modal-title-text").innerText = "Edit Task";
    document.getElementById("task-title").value = task.title;
    document.getElementById("task-desc").value = task.desc;

    // Load Tags: Convert Array ["Bug", "UI"] -> String "Bug, UI"
    document.getElementById("task-tags").value = (task.tags || []).join(", ");

    document.getElementById("task-date").value = task.date || "";
    document.getElementById("task-priority").value = task.priority || "Medium";

    document.getElementById("task-modal").classList.remove("hidden");
  }
}

// --- 3. SAVE TASK (FIXED) ---
function handleSaveTask() {
  // A. Get Input Values
  const titleInput = document.getElementById("task-title");
  const descInput = document.getElementById("task-desc");
  const tagsInput = document.getElementById("task-tags");
  const dateInput = document.getElementById("task-date");
  const priorityInput = document.getElementById("task-priority");

  const title = titleInput.value.trim();
  const desc = descInput.value.trim();
  const rawTags = tagsInput.value;
  const dateStr = dateInput.value;
  const priority = priorityInput.value;

  // B. VALIDATION: STOP IF NO TITLE
  // This prevents the "Undefined Task" bug
  if (!title || title === "") {
    alert("Task Title is required!");
    titleInput.focus();
    return;
  }

  // C. PROCESS TAGS
  // Convert string "Bug, UI " -> Array ["Bug", "UI"]
  const tags = rawTags
    .split(",")
    .map((t) => t.trim()) // Remove spaces around words
    .filter((t) => t !== ""); // Remove empty entries

  // D. DATE VALIDATION
  if (dateStr) {
    const todayStr = new Date().toISOString().split("T")[0];
    if (dateStr < todayStr) {
      alert("Date cannot be in the past!");
      return;
    }
  }

  // E. SAVE DATA
  if (editingTaskId === null) {
    // --- ADD NEW TASK ---
    // Check Column Limit for first column
    if (!checkStageLimit(0)) return;

    const newTask = {
      id: Date.now(),
      title: title,
      desc: desc,
      tags: tags, // <--- SAVING TAGS HERE
      date: dateStr,
      priority: priority,
      stageIdx: 0,
    };
    projects[activeIndex].tasks.push(newTask);
  } else {
    // --- UPDATE EXISTING TASK ---
    const task = projects[activeIndex].tasks.find(
      (t) => t.id === editingTaskId
    );
    if (task) {
      task.title = title;
      task.desc = desc;
      task.tags = tags; // <--- UPDATING TAGS HERE
      task.date = dateStr;
      task.priority = priority;
    }
  }

  // F. FINISH
  saveData();
  renderBoard();
  closeModal();
}

// --- 6. DRAG AND DROP ENGINE ---
function handleDrop(ev) {
  ev.preventDefault();
  const dragType = ev.dataTransfer.getData("type");
  let target = ev.target;

  // --- CASE 1: COLUMN REORDERING ---
  if (dragType === "column") {
    while (target && !target.classList.contains("status-column")) {
      target = target.parentElement;
    }

    if (target) {
      const allCols = Array.from(document.querySelectorAll(".status-column"));
      const targetIdx = allCols.indexOf(target);

      if (draggedColumnIdx !== null && draggedColumnIdx !== targetIdx) {
        moveProjectStage(draggedColumnIdx, targetIdx);
      }
    }
    return;
  }

  // --- CASE 2: TASK DROPPING ---
  const taskId = ev.dataTransfer.getData("text");

  // Bubble up to find the drop-zone
  while (target && !target.classList.contains("drop-zone")) {
    target = target.parentElement;
  }

  if (target) {
    target.classList.remove("drag-over");

    // Get the index of the column we are dropping into
    const newIdx = parseInt(target.id.split("-")[1]);
    const task = projects[activeIndex].tasks.find((t) => t.id == taskId);

    if (task) {
      // CHECK LIMIT BEFORE MOVING
      // We only care if we are moving to a DIFFERENT column
      if (task.stageIdx !== newIdx) {
        // If validation fails (returns false), stop the drop
        if (!checkStageLimit(newIdx)) return;
      }

      // If we passed validation, update the task
      task.stageIdx = newIdx;
      updateTimestamp();
      saveData();
      renderBoard();
    }
  }
}

// --- 7. UTILITIES ---
function deleteTask(e, id) {
  e.stopPropagation();
  if (confirm("Delete this card?")) {
    projects[activeIndex].tasks = projects[activeIndex].tasks.filter(
      (t) => t.id !== id
    );
    saveData();
    renderBoard();
  }
}

// --- Helper Function ---
function handleDragOver(e) {
  e.preventDefault();
  let t = e.target;
  while (t && !t.classList.contains("drop-zone")) t = t.parentElement;
  if (t) t.classList.add("drag-over");
}
function handleDragLeave(e) {
  if (e.target.classList.contains("drop-zone"))
    e.target.classList.remove("drag-over");
}
function saveData() {
  localStorage.setItem("myProjects", JSON.stringify(projects));
}
function closeModal() {
  document.getElementById("task-modal").classList.add("hidden");
}

// Init
showView("project-list-view");
