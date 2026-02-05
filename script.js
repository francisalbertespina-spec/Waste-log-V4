let loadedRows = [];
let selectedPackage = "";
let compressedImageBase64 = "";
let pendingRequestId = null;
let toastQueue = [];
let activeToast = null;
let toastTimer = null;
window.isUploading = false;

const DEV_MODE = false; // Set to false for production

const scriptURL = "https://script.google.com/macros/s/AKfycbwBEuKeVKCv4obPOhmJ6mj_pb7tGihzNAQdRUBsTXKuIpTf6iLo74IV32ocBrHcQGM4/exec";

function showToast(message, type = "info", options = {}) {
  const { persistent = false, spinner = false, duration = 3000 } = options;
  toastQueue.push({ message, type, persistent, spinner, duration });
  processToastQueue();
}

function processToastQueue() {
  if (activeToast || toastQueue.length === 0) return;

  const { message, type, persistent, spinner, duration } = toastQueue.shift();
  const icons = { success: "✅", error: "❌", info: "ℹ️" };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconWrap = document.createElement("div");
  iconWrap.className = "toast-icon";

  if (spinner) {
    const spin = document.createElement("div");
    spin.className = "toast-spinner";
    iconWrap.appendChild(spin);
  } else {
    iconWrap.textContent = icons[type] || "ℹ️";
  }

  toast.appendChild(iconWrap);

  const msg = document.createElement("div");
  msg.className = "toast-message";
  msg.textContent = message;
  toast.appendChild(msg);

  document.body.appendChild(toast);
  activeToast = toast;

  if (!persistent) {
    toastTimer = setTimeout(() => dismissToast(toast), duration || 3000);
  }
}

function dismissToast(toast) {
  if (!toast) return;

  clearTimeout(toastTimer);
  toastTimer = null;

  toast.classList.add("hide");

  setTimeout(() => {
    toast.remove();
    activeToast = null;
    processToastQueue();
  }, 300);
}

function setLoginLoading(isLoading) {
  const btn = document.getElementById("buttonDiv");
  const loadingUI = document.getElementById("loginLoadingUI");

  if (!btn || !loadingUI) return;

  if (isLoading) {
    btn.style.display = "none";
    loadingUI.style.display = "flex";
  } else {
    btn.style.display = "flex";
    loadingUI.style.display = "none";
  }
}

// Section management
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  
  // Update toggle state when section changes
  updateToggleState(id);
  
  // Update breadcrumb package names
  updateBreadcrumbs();
}

// Update breadcrumb package displays
function updateBreadcrumbs() {
  if (selectedPackage) {
    const packageName = `Package ${selectedPackage.replace('P', '')}`;
    
    // Update all breadcrumb package references
    const currentPkg = document.getElementById('current-package');
    const formPkg = document.getElementById('form-package');
    const historyPkg = document.getElementById('history-package');
    const adminPkg = document.getElementById('admin-package');
    
    if (currentPkg) currentPkg.textContent = packageName;
    if (formPkg) formPkg.textContent = packageName;
    if (historyPkg) historyPkg.textContent = packageName;
    if (adminPkg) adminPkg.textContent = packageName;
  }
}

// Package selection
function selectPackage(pkg, el) {
  document.querySelectorAll('.package-card')
    .forEach(c => c.classList.remove('selected'));

  el.classList.add('selected');
  selectedPackage = pkg;
}

function confirmPackage() {
  if (!selectedPackage) {
    showToast("Please select a package first", "error");
    return;
  }

  updateBreadcrumbs();
  showSection("menu-section");
}

function backToPackage() {
  selectedPackage = "";
  document.querySelectorAll('.package-card')
    .forEach(c => c.classList.remove('selected'));
  
  showSection("package-section");
}

function showMenu() {
  showSection('menu-section');
}

function showLogForm() {
  showSection('form-section');
  document.getElementById('date').valueAsDate = new Date();
}

function showHistoryView() {
  showSection('history-section');
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  document.getElementById('toDate').valueAsDate = today;
  document.getElementById('fromDate').valueAsDate = weekAgo;
}

/* ================= ADMIN FUNCTIONS ================= */

// Admin dashboard navigation
function showUserManagement() {
  showSection("user-management-section");
  loadUsers();
}

function showRequestLogs() {
  showSection("request-logs-section");
  loadRequests();
}

function backToAdminDashboard() {
  showSection("admin-dashboard");
}

function showAdmin() {
  showSection("admin-dashboard");
}

async function loadUsers() {
  try {
    const res = await fetch(`${scriptURL}?action=getUsers&token=${localStorage.getItem("userToken")}`);
    const users = await res.json();
    renderUsers(users);
  } catch (e) {
    showToast("Failed to load users", "error");
  }
}

function renderUsers(users) {
  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = "";

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 20px; color: #999;">
          No users found
        </td>
      </tr>
    `;
    return;
  }

  users.forEach(u => {
    const tr = document.createElement("tr");
    
    // Status dropdown
    const statusOptions = ['Pending', 'Approved', 'Rejected'];
    const statusSelect = `
      <select class="admin-select status-select" 
              value="${u.status}"
              onchange="updateUserStatus('${u.email}', this.value)">
        ${statusOptions.map(opt => 
          `<option value="${opt}" ${u.status === opt ? 'selected' : ''}>${opt}</option>`
        ).join('')}
      </select>
    `;
    
    // Role dropdown
    const roleOptions = ['user', 'admin'];
    const roleSelect = `
      <select class="admin-select role-select" 
              value="${u.role || 'user'}"
              onchange="updateUserRole('${u.email}', this.value)">
        ${roleOptions.map(opt => 
          `<option value="${opt}" ${(u.role || 'user') === opt ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`
        ).join('')}
      </select>
    `;
    
    // Action buttons
    const actions = u.status === 'Pending' 
      ? `
        <button class="btn-action btn-approve" onclick="quickApprove('${u.email}')">
          ✓ Approve
        </button>
        <button class="btn-action btn-reject" onclick="quickReject('${u.email}')">
          ✗ Reject
        </button>
      `
      : `
        <button class="btn-action btn-delete" onclick="deleteUser('${u.email}')">
          🗑️ Delete
        </button>
      `;
    
    tr.innerHTML = `
      <td style="text-align: left;">${u.email}</td>
      <td>${statusSelect}</td>
      <td>${roleSelect}</td>
      <td class="action-cell">${actions}</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Apply dynamic styling to all dropdowns after rendering
  applyDropdownStyling();
}

//dropdownnstyling
function applyDropdownStyling() {
  // Style status dropdowns based on selected value
  document.querySelectorAll('.status-select').forEach(select => {
    const value = select.value;
    select.setAttribute('value', value); // Set attribute for CSS selector
  });
  
  // Style role dropdowns based on selected value
  document.querySelectorAll('.role-select').forEach(select => {
    const value = select.value;
    select.setAttribute('value', value); // Set attribute for CSS selector
  });
}


async function approveUser(email) {
  if (!confirm("Approve this user?")) return;

  await fetch(`${scriptURL}?action=approveUser&email=${encodeURIComponent(email)}&token=${localStorage.getItem("userToken")}`);
  loadUsers();
  showToast("User approved", "success");
}

async function rejectUser(email) {
  if (!confirm("Reject this user?")) return;

  await fetch(`${scriptURL}?action=rejectUser&email=${encodeURIComponent(email)}&token=${localStorage.getItem("userToken")}`);
  loadUsers();
  showToast("User rejected", "success");
}

// Quick approve (for pending users)
async function quickApprove(email) {
  await updateUserStatus(email, 'Approved');
}

// Quick reject (for pending users)
async function quickReject(email) {
  await updateUserStatus(email, 'Rejected');
}

// Update user status
async function updateUserStatus(email, status) {
  try {
    console.log('Updating status:', email, status);
    
    const action = status === 'Approved' ? 'approveUser' : 
                   status === 'Rejected' ? 'rejectUser' : 'updateUserStatus';
    
    const url = `${scriptURL}?action=${action}&email=${encodeURIComponent(email)}&status=${status}&token=${localStorage.getItem("userToken")}`;
    
    // Show loading state
    const select = event?.target;
    if (select) {
      select.classList.add('loading');
      select.disabled = true;
    }
    
    const res = await fetch(url);
    const data = await res.json();
    
    if (select) {
      select.classList.remove('loading');
      select.disabled = false;
    }
    
    if (data.success || data.status === 'success') {
      showToast(`User status updated to ${status}`, "success");
      loadUsers();
    } else {
      showToast(data.message || "Failed to update status", "error");
      loadUsers(); // Reload to reset dropdown
    }
  } catch (err) {
    console.error(err);
    showToast("Error updating user status", "error");
    loadUsers(); // Reload to reset dropdown
  }
}


// Update user role
async function updateUserRole(email, role) {
  try {
    console.log('Updating role:', email, role);
    
    const url = `${scriptURL}?action=updateUserRole&email=${encodeURIComponent(email)}&role=${role}&token=${localStorage.getItem("userToken")}`;
    
    // Show loading state
    const select = event?.target;
    if (select) {
      select.classList.add('loading');
      select.disabled = true;
    }
    
    const res = await fetch(url);
    const data = await res.json();
    
    if (select) {
      select.classList.remove('loading');
      select.disabled = false;
    }
    
    if (data.success || data.status === 'success') {
      showToast(`User role updated to ${role}`, "success");
      loadUsers();
    } else {
      showToast(data.message || "Failed to update role", "error");
      loadUsers(); // Reload to reset dropdown
    }
  } catch (err) {
    console.error(err);
    showToast("Error updating user role: " + err.message, "error");
    loadUsers(); // Reload to reset dropdown
  }
}

// Delete user
async function deleteUser(email) {
  if (!confirm(`Are you sure you want to delete user: ${email}?\n\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    const url = `${scriptURL}?action=deleteUser&email=${encodeURIComponent(email)}&token=${localStorage.getItem("userToken")}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.success || data.status === 'success') {
      showToast("User deleted successfully", "success");
      loadUsers();
    } else {
      showToast(data.message || "Failed to delete user", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Error deleting user", "error");
  }
}

async function loadRequests() {
  const res = await fetch(`${scriptURL}?action=getRequests&token=${localStorage.getItem("userToken")}`);
  const requests = await res.json();
  renderRequests(requests);
}

function renderRequests(requests) {
  const tbody = document.getElementById("requestsTableBody");
  tbody.innerHTML = "";

  requests.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: left;">${r.id}</td>
      <td>${new Date(r.time).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Image Compression
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => {
      img.src = e.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const MAX_WIDTH = 1024;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = height * (MAX_WIDTH / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
      resolve(compressedBase64);
    };

    img.onerror = reject;
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

// Image preview
async function previewImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const uploadDiv = document.querySelector('.photo-upload');
  const placeholder = uploadDiv.querySelector('.placeholder');

  let img = uploadDiv.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.className = "photo-preview";
    uploadDiv.appendChild(img);
  }

  const compressedBase64 = await compressImage(file);
  compressedImageBase64 = compressedBase64;
  img.src = compressedBase64;

  uploadDiv.classList.add("has-image");
  if (placeholder) placeholder.style.display = "none";
}

// Form validation
function validateForm() {
  const date = document.getElementById("date").value;
  const volume = document.getElementById("volume").value;
  const waste = document.getElementById("waste").value;

  if (!date) return false;
  if (!volume) return false;
  if (!waste) return false;
  if (!compressedImageBase64) return false;

  return true;
}

async function addEntry() {
  const dateField = document.getElementById("date");
  const volumeField = document.getElementById("volume");
  const wasteField = document.getElementById("waste");

  document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));

  if (!dateField.value) {
    document.getElementById('date-group').classList.add('error');
    showToast("Please select a date", "error");
    return;
  }

  if (!volumeField.value) {
    document.getElementById('volume-group').classList.add('error');
    showToast("Please enter volume", "error");
    return;
  }

  if (!wasteField.value) {
    document.getElementById('waste-group').classList.add('error');
    showToast("Please select waste type", "error");
    return;
  }

  if (!compressedImageBase64) {
    document.getElementById('photo-group').classList.add('error');
    showToast("Please upload a photo", "error");
    return;
  }

  if (window.isUploading) {
    showToast("Upload already in progress", "info");
    return;
  }

  window.isUploading = true;
  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading...";

  showToast("Uploading entry...", "info", { persistent: true, spinner: true });

  // Extract base64 data (remove "data:image/jpeg;base64," prefix)
  const base64Data = compressedImageBase64.split(',')[1];
  
  // Generate unique request ID to prevent duplicates
  const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const formData = {
    requestId: requestId,
    package: selectedPackage,
    date: dateField.value,
    volume: volumeField.value,
    waste: wasteField.value,
    imageByte: base64Data,  // Backend expects "imageByte"
    imageName: `Waste_${selectedPackage}_${Date.now()}.jpg`,  // Backend expects "imageName"
    token: localStorage.getItem("userToken")
  };

  try {
    const res = await fetch(scriptURL, {
      method: "POST",
      body: JSON.stringify(formData)
    });

    const result = await res.json();

    if (activeToast) dismissToast(activeToast);

    if (result.success) {
      showToast("Entry submitted successfully!", "success");
      document.getElementById('modal').classList.add('active');
      resetForm();
    } else {
      showToast(result.error || result.message || "Upload failed", "error");
    }

  } catch (err) {
    if (activeToast) dismissToast(activeToast);
    showToast("Network error. Please try again.", "error");
    console.error(err);
  } finally {
    window.isUploading = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Entry";
  }
}

function resetForm() {
  document.getElementById('date').value = '';
  document.getElementById('volume').value = '';
  document.getElementById('waste').value = '';
  document.getElementById('photo').value = '';

  const uploadDiv = document.querySelector('.photo-upload');
  const img = uploadDiv.querySelector('img');
  const placeholder = uploadDiv.querySelector('.placeholder');

  if (img) img.remove();
  if (placeholder) placeholder.style.display = 'block';
  uploadDiv.classList.remove('has-image');

  compressedImageBase64 = "";
  document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// Load history
async function loadHistory() {
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;

  document.getElementById("exportBtn").disabled = true;

  if (!from || !to) {
    showToast('Please select a date range', 'error');
    return;
  }

  if (!selectedPackage) {
    showToast('No package selected', 'error');
    return;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);

  if (diffDays > 31) {
    showToast('Date range must be 31 days or less', 'error');
    return;
  }

  document.getElementById('loading').style.display = 'block';
  document.getElementById('table-container').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';

  const url = `${scriptURL}?package=${selectedPackage}&from=${from}&to=${to}`;

  try {
    const res = await fetch(url);
    const rows = await res.json();
    loadedRows = rows;

    document.getElementById('loading').style.display = 'none';

    if (rows.error) {
      showToast(rows.error, 'error');
      document.getElementById('empty-state').style.display = 'block';
      return;
    }

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (rows.length <= 1) {
      document.getElementById('empty-state').style.display = 'block';
      return;
    }

    document.getElementById('table-container').style.display = 'block';
    document.getElementById("exportBtn").disabled = false;

    rows.slice(1).forEach(r => {
      const date = new Date(r[0]).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });

      let imageUrl = "";
      if (r[5]) {
        const match = r[5].match(/\/d\/([^/]+)/);
        if (match) {
          imageUrl = `https://drive.google.com/uc?export=view&id=${match[1]}`;
        }
      }
      
      const photoLink = imageUrl
        ? `<a class="photo-link" onclick="openImageModal('${imageUrl}')">View</a>`
        : '—';

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${date}</td>
        <td>${r[1]}</td>
        <td>${r[2]}</td>
        <td>${r[4]}</td>
        <td>${photoLink}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    showToast('Error loading data', 'error');
    console.error(err);
  }
}

// Export to XLSX
async function exportExcel() {
  const btn = document.getElementById("exportBtn");

  if (!loadedRows || loadedRows.length <= 1) {
    showToast("No data to export", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Exporting...";

  try {
    const rows = JSON.parse(JSON.stringify(loadedRows));
    rows[0] = ["Date", "Volume (kg)", "Waste Name", "Package", "User", "Photo Link", "System Timestamp"];

    for (let i = 1; i < rows.length; i++) {
      rows[i][0] = new Date(rows[i][0]).toLocaleDateString("en-US");
      if (rows[i][6]) {
        rows[i][6] = new Date(rows[i][6]).toLocaleString("en-US");
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 40 },
      { wch: 15 },
      { wch: 30 },
      { wch: 80 },
      { wch: 22 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Records");

    const filename = `waste_log_${selectedPackage}_${new Date()
      .toISOString()
      .split("T")[0]}.xlsx`;

    XLSX.writeFile(workbook, filename);
    showToast("Excel exported successfully!", "success");

  } catch (err) {
    console.error(err);
    showToast("Export failed", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Export to Excel (XLSX)";
  }
}

// Parse JWT token
function parseJwt(token) {
  var base64Url = token.split('.')[1];
  var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

// Display user info in header
function displayUserInfo(name, role) {
  const userInfo = document.getElementById('user-info');
  const userName = document.getElementById('user-name');
  const roleBadge = document.getElementById('user-role-badge');
  const modeToggle = document.getElementById('mode-toggle');
  
  if (userInfo && userName && roleBadge) {
    userName.textContent = name;
    roleBadge.textContent = role;
    
    if (role === 'admin') {
      roleBadge.classList.add('admin');
      // Show mode toggle for admins
      if (modeToggle) {
        modeToggle.style.display = 'flex';
        // Initialize to user mode (false = user mode)
        // This only runs once at login, won't affect navigation
        updateModeLabels(false);
      }
    }
    
    userInfo.style.display = 'flex';
  }
}

// Toggle between admin and user modes
function toggleAdminMode() {
  const toggle = document.getElementById('admin-mode-toggle');
  const isAdminMode = toggle.checked;

  if (isAdminMode) {
    showSection('admin-dashboard');
    showToast('Switched to Admin mode', 'info');
  } else {
    showSection('package-section');
    showToast('Switched to User mode', 'info');
  }
}



// Update mode label highlighting
function updateModeLabels(isAdminMode) {
  const userLabel = document.getElementById('mode-label-user');
  const adminLabel = document.getElementById('mode-label-admin');
  
  if (userLabel && adminLabel) {
    if (isAdminMode) {
      userLabel.classList.remove('active');
      adminLabel.classList.add('active');
    } else {
      userLabel.classList.add('active');
      adminLabel.classList.remove('active');
    }
  }
}

// Update toggle state based on current section
function updateToggleState(sectionId) {
  const toggle = document.getElementById('admin-mode-toggle');
  if (!toggle) return;

  const adminSections = [
    'admin-dashboard',
    'user-management-section',
    'request-logs-section'
  ];

  const isAdminSection = adminSections.includes(sectionId);

  toggle.checked = isAdminSection;
  updateModeLabels(isAdminSection);
}


// Logout function
function logout() {
  if (confirm('Are you sure you want to sign out?')) {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userRole');
    document.body.classList.remove('is-admin');
    
    // Hide user info
    const userInfo = document.getElementById('user-info');
    if (userInfo) userInfo.style.display = 'none';
    
    // Reset to login screen
    showSection('login-section');
    showToast('Signed out successfully', 'info');
    
    // Reload to reset Google Sign-In
    setTimeout(() => location.reload(), 1000);
  }
}

// Google login handler
async function handleCredentialResponse(response) {
  setLoginLoading(true);

  const responsePayload = parseJwt(response.credential);
  const email = responsePayload.email.toLowerCase();
  const name = responsePayload.name;

  try {
    const checkURL = `${scriptURL}?email=${encodeURIComponent(email)}`;
    const res = await fetch(checkURL);
    const data = await res.json();

    setLoginLoading(false);

    if (data.status === "Approved") {
      localStorage.setItem("userToken", data.token);
      localStorage.setItem("userRole", data.role || "user");

      // Display user info in header
      displayUserInfo(name, data.role || "user");

      showToast(`Welcome, ${name}!`, "success");

      // Always start with package selection (user mode)
      showSection("package-section");
      
      // Enable admin UI if admin
      if (data.role === "admin") {
        enableAdminUI();
      }
    } else if (data.status === "Rejected") {
      showToast("Access denied by admin", "error");
    } else {
      showToast("Awaiting admin approval", "info");
    }

  } catch (err) {
    console.error(err);
    setLoginLoading(false);
    showToast("Connection error", "error");
  }
}

// Initialize
window.onload = function() {
  if (DEV_MODE) {
    console.warn('⚠️ DEV MODE ENABLED');
    localStorage.setItem("userToken", "DEV_TOKEN");
    document.querySelectorAll('.section')
      .forEach(s => s.classList.remove('active'));
    document.getElementById('package-section').classList.add('active');
    showToast('Dev mode active - Auth bypassed', 'info');
    return;
  }

  // NORMAL MODE (Google Sign-In)
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({
      client_id: "648943267004-cgsr4bhegtmma2jmlsekjtt494j8cl7f.apps.googleusercontent.com",
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    google.accounts.id.renderButton(
      document.getElementById("buttonDiv"),
      { theme: "outline", size: "large", width: "250" }
    );
  } else {
    console.error("Google Identity not loaded");
    showToast('Login service unavailable', 'error');
  }
};

// Modal functions
function openImageModal(url) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("modalImage");

  const match = url.match(/[-\w]{25,}/);
  if (!match) {
    showToast("Invalid image link", "error");
    return;
  }

  const fileId = match[0];
  const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;

  img.src = directUrl;
  modal.style.display = "flex";
}

function closeImageModal() {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("modalImage");

  img.src = "";
  modal.style.display = "none";
}

function enableAdminUI() {
  document.body.classList.add("is-admin");
  console.log("Admin mode enabled");
}
