let loadedRows = [];
let selectedPackage = "";
let compressedImageBase64 = "";
let pendingRequestId = null;
let toastQueue = [];
let activeToast = null;
let toastTimer = null;
let selectedWasteType = "";
window.isUploading = false;

// ENHANCED Duplicate submission prevention - AGGRESSIVE MODE
let activeSubmissions = new Set(); // Track active request IDs
let submissionFingerprints = new Map(); // Track ALL attempts (success OR in-progress)
const FINGERPRINT_LOCK_DURATION = 120000; // 2 minutes lock - prevents ANY resubmission

const DEV_MODE = false; // Set to false for production

const scriptURL = "https://script.google.com/macros/s/AKfycbwOzLtzZtvR2hrJuS6uVPe58GxATwtwwkSJ_yP073vST9B3283AYd7ADG8ApmPuDKJO/exec";
// Stable V4 - const scriptURL = "https://script.google.com/macros/s/AKfycbxe2nDYZzBT8QCsp_XQa0RaV36c0MMUAYDdrwwGydSs0AbQ1H7RlbGHyE8YSmbhQxk-/exec";
//const scriptURL = "https://script.google.com/macros/s/AKfycbwBEuKeVKCv4obPOhmJ6mj_pb7tGihzNAQdRUBsTXKuIpTf6iLo74IV32ocBrHcQGM4/exec";

// ═══════════════════════════════════════════════════════════════════════════
// NEW: DUPLICATE PREVENTION HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Store successful submissions in localStorage (persists across sessions)
function markSubmissionAsCompleted(fingerprint) {
  const completedSubmissions = JSON.parse(localStorage.getItem('completedSubmissions') || '{}');
  completedSubmissions[fingerprint] = Date.now();
  
  // Keep only last 24 hours of submissions
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [fp, timestamp] of Object.entries(completedSubmissions)) {
    if (timestamp < oneDayAgo) {
      delete completedSubmissions[fp];
    }
  }
  
  localStorage.setItem('completedSubmissions', JSON.stringify(completedSubmissions));
  console.log('💾 Saved to localStorage:', fingerprint);
}

// Check if submission was already completed
function isSubmissionCompleted(fingerprint) {
  const completedSubmissions = JSON.parse(localStorage.getItem('completedSubmissions') || '{}');
  
  // Check if exists and was within last 24 hours
  if (completedSubmissions[fingerprint]) {
    const timeSinceSubmission = Date.now() - completedSubmissions[fingerprint];
    const hoursSince = Math.floor(timeSinceSubmission / (1000 * 60 * 60));
    return { completed: true, hoursSince };
  }
  
  return { completed: false };
}

// Generate deterministic requestId from fingerprint
function generateRequestId(fingerprint) {
  const today = new Date().toISOString().split('T')[0];
  return `${fingerprint}-${today}`.replace(/[^a-zA-Z0-9-]/g, '_');
}

// ═══════════════════════════════════════════════════════════════════════════

async function stampImageWithWatermark(file, userEmail, selectedPackage) {
  return new Promise((resolve, reject) => {

    if (!navigator.geolocation) {
      alert("GPS not supported");
      return reject("No GPS");
    }

    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          canvas.width = img.width;
          canvas.height = img.height;

          ctx.drawImage(img, 0, 0);

          const now = new Date();
          const pad = n => String(n).padStart(2, "0");
          const timestamp =
            now.getFullYear() + "-" +
            pad(now.getMonth() + 1) + "-" +
            pad(now.getDate()) + " " +
            pad(now.getHours()) + ":" +
            pad(now.getMinutes());

          const watermarkText = `HDJV ENVI UNIT
${timestamp}
Lat: ${lat.toFixed(4)}  Lng: ${lng.toFixed(4)}
User: ${userEmail}
Pkg: ${selectedPackage}`;

          const lines = watermarkText.split("\n");

          const boxHeight = lines.length * 28 + 20;

          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight);

          ctx.fillStyle = "white";
          ctx.font = "22px Arial";
          ctx.textBaseline = "top";

          lines.forEach((line, i) => {
            ctx.fillText(line, 10, canvas.height - boxHeight + 10 + i * 28);
          });

          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };

        img.src = reader.result;
      };

      reader.readAsDataURL(file);

    }, err => {
      alert("GPS permission is required.");
      reject(err);
    }, {
      enableHighAccuracy: true,
      timeout: 10000
    });

  });
}


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
  let timeout = duration || 3000;

    if (type === "error") {
    timeout = 8000; // 🔥 error messages stay 8s
    }

    toastTimer = setTimeout(() => dismissToast(toast), timeout);
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
    
    // Update ALL breadcrumb package references (both hazardous and solid)
    const breadcrumbIds = [
      'current-package', 'waste-type-package',
      'hazardous-menu-package', 'hazardous-form-package', 'hazardous-history-package',
      'solid-menu-package', 'solid-form-package', 'solid-history-package'
    ];
    
    breadcrumbIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = packageName;
    });
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
  showSection("waste-type-section"); // Changed from "menu-section"
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

function showLogForm(type) {
  if (type === 'hazardous') {
    showSection('hazardous-form-section');
    document.getElementById('hazardous-date').valueAsDate = new Date();
  } else if (type === 'solid') {
    showSection('solid-form-section');
    document.getElementById('solid-date').valueAsDate = new Date();
  }
}

function showHistoryView(type) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  if (type === 'hazardous') {
    showSection('hazardous-history-section');
    document.getElementById('hazardous-toDate').valueAsDate = today;
    document.getElementById('hazardous-fromDate').valueAsDate = weekAgo;
  } else if (type === 'solid') {
    showSection('solid-history-section');
    document.getElementById('solid-toDate').valueAsDate = today;
    document.getElementById('solid-fromDate').valueAsDate = weekAgo;
  }
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

// Image preview - FIXED VERSION with formType parameter
async function previewImage(event, formType) {
  const file = event.target.files[0];
  if (!file) return;

  // Get the correct form section based on formType
  const sectionId = formType === 'hazardous' ? 'hazardous-form-section' : 'solid-form-section';
  const uploadDiv = document.querySelector(`#${sectionId} .photo-upload`);
  const placeholder = uploadDiv.querySelector('.placeholder');

  let img = uploadDiv.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.className = "photo-preview";
    uploadDiv.appendChild(img);
  }

  const imageBitmap = await createImageBitmap(file);

  const canvas = document.createElement("canvas");

  // 🔽 Resize for sanity (optional but safe)
  const MAX_WIDTH = 1280;
  let width = imageBitmap.width;
  let height = imageBitmap.height;

  if (width > MAX_WIDTH) {
    height = height * (MAX_WIDTH / width);
    width = MAX_WIDTH;
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // 📌 Build watermark text
  const email = localStorage.getItem("userEmail") || "unknown";
  const pkg = selectedPackage || "N/A";

  let text = `HDJV ENVI UNIT\n`;
  text += `${new Date().toLocaleString()}\n`;

  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
    );
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    text += `Lat: ${lat} Lng: ${lng}\n`;
  } catch (e) {
    text += `Lat: N/A Lng: N/A\n`;
  }

  text += `User: ${email}\nPkg: ${pkg}`;

  // 🖤 Background bar
  const lines = text.split("\n");
  const lineHeight = 40;
  const padding = 20;
  const boxHeight = lines.length * lineHeight + padding * 2;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight);

  // ✍️ Draw text
  ctx.fillStyle = "white";
  ctx.font = "32px Arial";
  lines.forEach((line, i) => {
    ctx.fillText(line, 20, canvas.height - boxHeight + padding + (i + 1) * lineHeight);
  });

  const finalImage = canvas.toDataURL("image/jpeg", 0.85);

  compressedImageBase64 = finalImage;
  img.src = finalImage;
  img.style.display = 'block'; // FIX: Make sure image is visible

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


// add entry
async function addEntry(type) {
  if (type === 'hazardous') {
    await addHazardousEntry();
  } else if (type === 'solid') {
    await addSolidEntry();
  }
}

async function addHazardousEntry() {
  // Clear previous errors
  document.querySelectorAll('#hazardous-form-section .form-group').forEach(g => g.classList.remove('error'));

  const date = document.getElementById('hazardous-date').value;
  const volume = document.getElementById('hazardous-volume').value;
  const waste = document.getElementById('hazardous-waste').value;
  const photo = document.getElementById('hazardous-photo').files[0];

  let hasError = false;

  if (!date) {
    document.getElementById('hazardous-date-group').classList.add('error');
    hasError = true;
  }
  if (!volume) {
    document.getElementById('hazardous-volume-group').classList.add('error');
    hasError = true;
  }
  if (!waste) {
    document.getElementById('hazardous-waste-group').classList.add('error');
    hasError = true;
  }
  if (!photo) {
    document.getElementById('hazardous-photo-group').classList.add('error');
    hasError = true;
  }

  if (hasError) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // ═══ ENHANCED DUPLICATE PREVENTION ═══
  
  // Create submission fingerprint FIRST (before any async operations)
  const submissionFingerprint = `${selectedPackage}-hazardous-${date}-${volume}-${waste}`;
  
  // FIRST CHECK: Was this already successfully submitted? (Check localStorage)
  const completionCheck = isSubmissionCompleted(submissionFingerprint);
  if (completionCheck.completed) {
    showToast(`Entry was already submitted ${completionCheck.hoursSince}h ago - please change the data to submit again`, 'error');
    return;
  }
  
  // Clean up expired fingerprints
  const now = Date.now();
  for (const [fp, timestamp] of submissionFingerprints.entries()) {
    if (now - timestamp > FINGERPRINT_LOCK_DURATION) {
      submissionFingerprints.delete(fp);
      console.log('🧹 Cleaned up expired fingerprint:', fp);
    }
  }
  
  // SECOND CHECK: Is this currently being submitted?
  if (submissionFingerprints.has(submissionFingerprint)) {
    const lockedAt = submissionFingerprints.get(submissionFingerprint);
    const secondsAgo = Math.floor((now - lockedAt) / 1000);
    console.log('🚫 DUPLICATE BLOCKED:', submissionFingerprint, `(locked ${secondsAgo}s ago)`);
    showToast(`Entry is currently being submitted - please wait`, 'error');
    return;
  }
  
  // LOCK THIS FINGERPRINT IMMEDIATELY - before watermarking or uploading
  submissionFingerprints.set(submissionFingerprint, now);
  console.log('🔒 LOCKED fingerprint:', submissionFingerprint);

  // Disable submit button
  const submitBtn = document.getElementById('hazardous-submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  // Generate DETERMINISTIC request ID (same submission = same ID)
  const requestId = generateRequestId(submissionFingerprint);
  activeSubmissions.add(requestId);
  console.log('📝 Using requestId:', requestId);

  // Show uploading toast with spinner
  showToast('Uploading...', 'info', { persistent: true, spinner: true });

  try {
    // Get email from localStorage
    const userEmail = localStorage.getItem("userEmail") || "Unknown";
    
    // Stamp image with watermark
    const watermarkedImage = await stampImageWithWatermark(photo, userEmail, selectedPackage);
    
    const payload = {
      requestId: requestId, // Now deterministic!
      token: localStorage.getItem("userToken"),
      package: selectedPackage,
      wasteType: 'hazardous',
      date: date,
      volume: volume,
      waste: waste,
      imageByte: watermarkedImage.split(',')[1],
      imageName: `${selectedPackage}_Hazardous_${Date.now()}.jpg`
    };

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const res = await fetch(scriptURL, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    // Dismiss the uploading toast
    if (activeToast) {
      dismissToast(activeToast);
    }

    if (data.success) {
      console.log('✅ Upload SUCCESS for fingerprint:', submissionFingerprint);
      
      // CRITICAL: Mark as completed in localStorage
      markSubmissionAsCompleted(submissionFingerprint);
      
      // Keep fingerprint locked for full duration
      showToast('Entry submitted successfully!', 'success');
      
      // Clear form
      document.getElementById('hazardous-date').value = '';
      document.getElementById('hazardous-volume').value = '';
      document.getElementById('hazardous-waste').value = '';
      document.getElementById('hazardous-photo').value = '';
      
      // Reset photo preview properly
      const uploadDiv = document.querySelector('#hazardous-form-section .photo-upload');
      const img = uploadDiv.querySelector('.photo-preview');
      const placeholder = uploadDiv.querySelector('.placeholder');
      
      if (img) {
        img.remove();
      }
      
      if (placeholder) {
        placeholder.style.display = 'flex';
      }
      
      uploadDiv.classList.remove('has-image');
      
      // Reset date to today for next entry
      document.getElementById('hazardous-date').valueAsDate = new Date();
      
    } else if (data.error === 'Duplicate request') {
      // Server says it's a duplicate - this means it WAS already saved
      console.log('⚠️ Server reported duplicate - marking as completed');
      markSubmissionAsCompleted(submissionFingerprint);
      showToast('Entry was already submitted successfully', 'info');
      
      // Clear form since it was actually saved
      document.getElementById('hazardous-date').value = '';
      document.getElementById('hazardous-volume').value = '';
      document.getElementById('hazardous-waste').value = '';
      document.getElementById('hazardous-photo').value = '';
      
      const uploadDiv = document.querySelector('#hazardous-form-section .photo-upload');
      const img = uploadDiv.querySelector('.photo-preview');
      const placeholder = uploadDiv.querySelector('.placeholder');
      if (img) img.remove();
      if (placeholder) placeholder.style.display = 'flex';
      uploadDiv.classList.remove('has-image');
      
      document.getElementById('hazardous-date').valueAsDate = new Date();
      
    } else {
      console.log('❌ Upload FAILED for fingerprint:', submissionFingerprint, data.error);
      // On other failures, unlock after 30 seconds (longer than before)
      setTimeout(() => {
        submissionFingerprints.delete(submissionFingerprint);
        console.log('🔓 Unlocked failed fingerprint:', submissionFingerprint);
      }, 30000); // 30 seconds instead of 10
      
      showToast(data.error || 'Submission failed', 'error');
    }
  } catch (error) {
    console.error('💥 Error during upload:', error);
    
    // Dismiss the uploading toast
    if (activeToast) {
      dismissToast(activeToast);
    }
    
    // On network error, keep lock for LONGER (60 seconds) 
    // This prevents rapid retry attempts that create duplicates
    setTimeout(() => {
      submissionFingerprints.delete(submissionFingerprint);
      console.log('🔓 Unlocked errored fingerprint after network error:', submissionFingerprint);
    }, 60000); // 60 seconds for network errors
    
    // Provide more specific error messages
    if (error.name === 'AbortError') {
      showToast('Upload timeout - entry may have been saved - check history before retrying', 'error');
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      showToast('Network error - entry may have been saved - check history before retrying', 'error');
    } else {
      showToast('Error submitting entry - check history before retrying', 'error');
    }
  } finally {
    // Remove from active submissions
    activeSubmissions.delete(requestId);
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Entry';
  }
}

// NEW: Solid waste entry
async function addSolidEntry() {
  // Clear previous errors
  document.querySelectorAll('#solid-form-section .form-group').forEach(g => g.classList.remove('error'));

  const date = document.getElementById('solid-date').value;
  const locationNum = document.getElementById('solid-location').value;
  const waste = document.getElementById('solid-waste').value;
  const photo = document.getElementById('solid-photo').files[0];

  let hasError = false;

  if (!date) {
    document.getElementById('solid-date-group').classList.add('error');
    hasError = true;
  }
  if (!locationNum || locationNum < 462 || locationNum > 1260) {
    document.getElementById('solid-location-group').classList.add('error');
    hasError = true;
  }
  if (!waste) {
    document.getElementById('solid-waste-group').classList.add('error');
    hasError = true;
  }
  if (!photo) {
    document.getElementById('solid-photo-group').classList.add('error');
    hasError = true;
  }

  if (hasError) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // ═══ ENHANCED DUPLICATE PREVENTION ═══
  
  const location = `P-${locationNum}`;
  
  // Create submission fingerprint FIRST (before any async operations)
  const submissionFingerprint = `${selectedPackage}-solid-${date}-${location}-${waste}`;
  
  // FIRST CHECK: Was this already successfully submitted? (Check localStorage)
  const completionCheck = isSubmissionCompleted(submissionFingerprint);
  if (completionCheck.completed) {
    showToast(`Entry was already submitted ${completionCheck.hoursSince}h ago - please change the data to submit again`, 'error');
    return;
  }
  
  // Clean up expired fingerprints
  const now = Date.now();
  for (const [fp, timestamp] of submissionFingerprints.entries()) {
    if (now - timestamp > FINGERPRINT_LOCK_DURATION) {
      submissionFingerprints.delete(fp);
      console.log('🧹 Cleaned up expired fingerprint:', fp);
    }
  }
  
  // SECOND CHECK: Is this currently being submitted?
  if (submissionFingerprints.has(submissionFingerprint)) {
    const lockedAt = submissionFingerprints.get(submissionFingerprint);
    const secondsAgo = Math.floor((now - lockedAt) / 1000);
    console.log('🚫 DUPLICATE BLOCKED:', submissionFingerprint, `(locked ${secondsAgo}s ago)`);
    showToast(`Entry is currently being submitted - please wait`, 'error');
    return;
  }
  
  // LOCK THIS FINGERPRINT IMMEDIATELY - before watermarking or uploading
  submissionFingerprints.set(submissionFingerprint, now);
  console.log('🔒 LOCKED fingerprint:', submissionFingerprint);

  // Disable submit button
  const submitBtn = document.getElementById('solid-submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  // Generate DETERMINISTIC request ID (same submission = same ID)
  const requestId = generateRequestId(submissionFingerprint);
  activeSubmissions.add(requestId);
  console.log('📝 Using requestId:', requestId);

  // Show uploading toast with spinner
  showToast('Uploading...', 'info', { persistent: true, spinner: true });

  try {
    // Get email from localStorage
    const userEmail = localStorage.getItem("userEmail") || "Unknown";
    
    // Stamp image with watermark
    const watermarkedImage = await stampImageWithWatermark(photo, userEmail, selectedPackage);
    
    const payload = {
      requestId: requestId, // Now deterministic!
      token: localStorage.getItem("userToken"),
      package: selectedPackage,
      wasteType: 'solid',
      date: date,
      location: location,
      waste: waste,
      imageByte: watermarkedImage.split(',')[1],
      imageName: `${selectedPackage}_Solid_${Date.now()}.jpg`
    };

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const res = await fetch(scriptURL, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    // Dismiss the uploading toast
    if (activeToast) {
      dismissToast(activeToast);
    }

    if (data.success) {
      console.log('✅ Upload SUCCESS for fingerprint:', submissionFingerprint);
      
      // CRITICAL: Mark as completed in localStorage
      markSubmissionAsCompleted(submissionFingerprint);
      
      // Keep fingerprint locked for full duration
      showToast('Entry submitted successfully!', 'success');
      
      // Clear form
      document.getElementById('solid-date').value = '';
      document.getElementById('solid-location').value = '';
      document.getElementById('solid-waste').value = '';
      document.getElementById('solid-photo').value = '';
      
      // Reset photo preview properly
      const uploadDiv = document.querySelector('#solid-form-section .photo-upload');
      const img = uploadDiv.querySelector('.photo-preview');
      const placeholder = uploadDiv.querySelector('.placeholder');
      
      if (img) {
        img.remove();
      }
      
      if (placeholder) {
        placeholder.style.display = 'flex';
      }
      
      uploadDiv.classList.remove('has-image');
      
      // Reset date to today for next entry
      document.getElementById('solid-date').valueAsDate = new Date();
      
    } else if (data.error === 'Duplicate request') {
      // Server says it's a duplicate - this means it WAS already saved
      console.log('⚠️ Server reported duplicate - marking as completed');
      markSubmissionAsCompleted(submissionFingerprint);
      showToast('Entry was already submitted successfully', 'info');
      
      // Clear form since it was actually saved
      document.getElementById('solid-date').value = '';
      document.getElementById('solid-location').value = '';
      document.getElementById('solid-waste').value = '';
      document.getElementById('solid-photo').value = '';
      
      const uploadDiv = document.querySelector('#solid-form-section .photo-upload');
      const img = uploadDiv.querySelector('.photo-preview');
      const placeholder = uploadDiv.querySelector('.placeholder');
      if (img) img.remove();
      if (placeholder) placeholder.style.display = 'flex';
      uploadDiv.classList.remove('has-image');
      
      document.getElementById('solid-date').valueAsDate = new Date();
      
    } else {
      console.log('❌ Upload FAILED for fingerprint:', submissionFingerprint, data.error);
      // On other failures, unlock after 30 seconds (longer than before)
      setTimeout(() => {
        submissionFingerprints.delete(submissionFingerprint);
        console.log('🔓 Unlocked failed fingerprint:', submissionFingerprint);
      }, 30000); // 30 seconds instead of 10
      
      showToast(data.error || 'Submission failed', 'error');
    }
  } catch (error) {
    console.error('💥 Error during upload:', error);
    
    // Dismiss the uploading toast
    if (activeToast) {
      dismissToast(activeToast);
    }
    
    // On network error, keep lock for LONGER (60 seconds)
    // This prevents rapid retry attempts that create duplicates
    setTimeout(() => {
      submissionFingerprints.delete(submissionFingerprint);
      console.log('🔓 Unlocked errored fingerprint after network error:', submissionFingerprint);
    }, 60000); // 60 seconds for network errors
    
    // Provide more specific error messages
    if (error.name === 'AbortError') {
      showToast('Upload timeout - entry may have been saved - check history before retrying', 'error');
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      showToast('Network error - entry may have been saved - check history before retrying', 'error');
    } else {
      showToast('Error submitting entry - check history before retrying', 'error');
    }
  } finally {
    // Remove from active submissions
    activeSubmissions.delete(requestId);
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Entry';
  }
}

  
// Load history
async function loadHistory(type) {
  const prefix = type; // 'hazardous' or 'solid'
  
  const from = document.getElementById(`${prefix}-fromDate`).value;
  const to = document.getElementById(`${prefix}-toDate`).value;

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

  document.getElementById(`${prefix}-loading`).style.display = 'block';
  document.getElementById(`${prefix}-table-container`).style.display = 'none';
  document.getElementById(`${prefix}-empty-state`).style.display = 'none';

  const url = `${scriptURL}?package=${selectedPackage}&wasteType=${type}&from=${from}&to=${to}`;

  try {
    const res = await fetch(url);
    const rows = await res.json();
    
    // Store for export
    if (type === 'hazardous') {
      window.loadedHazardousRows = rows;
    } else {
      window.loadedSolidRows = rows;
    }

    document.getElementById(`${prefix}-loading`).style.display = 'none';

    if (rows.error) {
      showToast(rows.error, 'error');
      document.getElementById(`${prefix}-empty-state`).style.display = 'block';
      return;
    }

    const tbody = document.getElementById(`${prefix}-table-body`);
    tbody.innerHTML = '';

    if (rows.length <= 1) {
      document.getElementById(`${prefix}-empty-state`).style.display = 'block';
      return;
    }

    document.getElementById(`${prefix}-table-container`).style.display = 'block';
    document.getElementById(`${prefix}-exportBtn`).disabled = false;

    rows.slice(1).forEach(r => {
      const date = new Date(r[0]).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });

      let imageUrl = "";
      const photoCol = type === 'hazardous' ? 5 : 4; // Different column for photo
      
      if (r[photoCol]) {
        const match = r[photoCol].match(/\/d\/([^/]+)/);
        if (match) {
          imageUrl = `https://drive.google.com/uc?export=view&id=${match[1]}`;
        } else {
          imageUrl = r[photoCol];
        }
      }
      
      const photoLink = imageUrl
        ? `<a class="photo-link" onclick="openImageModal('${imageUrl}')">View</a>`
        : '—';

      const tr = document.createElement("tr");
      
      if (type === 'hazardous') {
        tr.innerHTML = `
          <td>${date}</td>
          <td>${r[1]}</td>
          <td>${r[2]}</td>
          <td>${r[4]}</td>
          <td>${photoLink}</td>
        `;
      } else {
        // Solid waste: Date, Location, Waste, User, Photo
        tr.innerHTML = `
          <td>${date}</td>
          <td>${r[1]}</td>
          <td>${r[2]}</td>
          <td>${r[4]}</td>
          <td>${photoLink}</td>
        `;
      }
      
      tbody.appendChild(tr);
    });
  } catch (err) {
    document.getElementById(`${prefix}-loading`).style.display = 'none';
    showToast('Error loading data', 'error');
    console.error(err);
  }
}

// Export to XLSX
async function exportExcel(type) {
  const prefix = type;
  const btn = document.getElementById(`${prefix}-exportBtn`);
  const rows = type === 'hazardous' ? window.loadedHazardousRows : window.loadedSolidRows;

  if (!rows || rows.length <= 1) {
    showToast("No data to export", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Exporting...";

  try {
    const exportRows = JSON.parse(JSON.stringify(rows));
    
    if (type === 'hazardous') {
      exportRows[0] = ["Date", "Volume (kg)", "Waste Name", "Package", "User", "Photo Link", "System Timestamp"];
    } else {
      exportRows[0] = ["Date", "Location (Pier)", "Waste Name", "Package", "User", "Photo Link", "System Timestamp"];
    }

    for (let i = 1; i < exportRows.length; i++) {
      exportRows[i][0] = new Date(exportRows[i][0]).toLocaleDateString("en-US");
      if (exportRows[i][6]) {
        exportRows[i][6] = new Date(exportRows[i][6]).toLocaleString("en-US");
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(exportRows);
    
    if (type === 'hazardous') {
      worksheet["!cols"] = [
        { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 15 }, 
        { wch: 30 }, { wch: 80 }, { wch: 22 }
      ];
    } else {
      worksheet["!cols"] = [
        { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, 
        { wch: 30 }, { wch: 80 }, { wch: 22 }
      ];
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Records");

    const filename = `${type}_waste_log_${selectedPackage}_${new Date()
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

  const responsePayload = parseJwt(response.credential); // This is Google's JWT
  const email = responsePayload.email.toLowerCase();
  const name = responsePayload.name;

  // IMPORTANT: Store email in localStorage for later use
  localStorage.setItem("userEmail", email);

  try {
    const checkURL = `${scriptURL}?email=${encodeURIComponent(email)}`;
    const res = await fetch(checkURL);
    const data = await res.json();

    setLoginLoading(false);

    if (data.status === "Approved") {
      localStorage.setItem("userToken", data.token);
      localStorage.setItem("userRole", data.role || "user");

      displayUserInfo(name, data.role || "user");
      showToast(`Welcome, ${name}!`, "success");
      showSection("package-section");
      
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

  //additional js

  function selectWasteType(type) {
  selectedWasteType = type;
  if (type === 'hazardous') {
    showSection('hazardous-menu-section');
  } else if (type === 'solid') {
    showSection('solid-menu-section');
  }
}

// Back to waste type selection
function backToWasteType() {
  showSection('waste-type-section');
}

// Back to hazardous menu
function backToHazardousMenu() {
  showSection('hazardous-menu-section');
}

// Back to solid menu
function backToSolidMenu() {
  showSection('solid-menu-section');
}
