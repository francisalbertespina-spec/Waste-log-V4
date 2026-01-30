// ==================== STATE MANAGEMENT ====================
const AppState = {
  loadedRows: [],
  selectedPackage: "",
  compressedImageBase64: "",
  pendingRequestId: null,
  toastQueue: [],
  activeToast: null,
  toastTimer: null,
  isUploading: false,
  
  reset() {
    this.loadedRows = [];
    this.selectedPackage = "";
    this.compressedImageBase64 = "";
    this.pendingRequestId = null;
  }
};

// ==================== UTILITIES ====================
const Utils = {
  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str
      .trim()
      .replace(/[<>]/g, '')
      .substring(0, 1000);
  },
  
  /**
   * Debounce function calls
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
  
  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  },
  
  /**
   * Format date consistently
   */
  formatDate: {
    long(date) {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    },
    short(date) {
      return new Date(date).toLocaleDateString("en-US");
    },
    ISO(date) {
      return new Date(date).toISOString().split("T")[0];
    }
  }
};

// ==================== TOAST SYSTEM ====================
const Toast = {
  show(message, type = "info", options = {}) {
    const { persistent = false, spinner = false, duration = CONFIG.TOAST.DEFAULT_DURATION } = options;
    
    // Prevent queue overflow
    if (AppState.toastQueue.length >= CONFIG.TOAST.MAX_QUEUE) {
      AppState.toastQueue.shift();
    }
    
    AppState.toastQueue.push({ message, type, persistent, spinner, duration });
    this.processQueue();
  },
  
  processQueue() {
    if (AppState.activeToast || AppState.toastQueue.length === 0) return;
    
    const { message, type, persistent, spinner, duration } = AppState.toastQueue.shift();
    const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    // Icon or spinner
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
    
    // Message
    const msg = document.createElement("div");
    msg.className = "toast-message";
    msg.textContent = message;
    toast.appendChild(msg);
    
    document.body.appendChild(toast);
    AppState.activeToast = toast;
    
    // Auto dismiss
    if (!persistent) {
      AppState.toastTimer = setTimeout(() => this.dismiss(toast), duration);
    }
  },
  
  dismiss(toast) {
    if (!toast) return;
    
    clearTimeout(AppState.toastTimer);
    AppState.toastTimer = null;
    
    toast.style.opacity = '0';
    
    setTimeout(() => {
      toast.remove();
      AppState.activeToast = null;
      this.processQueue();
    }, 300);
  }
};

// ==================== AUTHENTICATION ====================
const Auth = {
  TOKEN_KEY: 'userToken',
  
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },
  
  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },
  
  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },
  
  isAuthenticated() {
    return !!this.getToken();
  },
  
  requireAuth() {
    if (!this.isAuthenticated()) {
      Toast.show("Session expired. Please log in again.", "error");
      UI.showSection("login-section");
      return false;
    }
    return true;
  },
  
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window.atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('JWT parse error:', e);
      return null;
    }
  },
  
  async handleGoogleLogin(response) {
    UI.setLoginLoading(true);
    
    const payload = this.parseJwt(response.credential);
    if (!payload) {
      Toast.show("Invalid login token", "error");
      UI.setLoginLoading(false);
      return;
    }
    
    const email = payload.email.toLowerCase();
    
    try {
      const checkURL = `${CONFIG.SCRIPT_URL}?email=${encodeURIComponent(email)}`;
      const res = await fetch(checkURL);
      const data = await res.json();
      
      UI.setLoginLoading(false);
      
      if (data.status === "Approved") {
        this.setToken(data.token);
        UI.showSection("package-section");
        Toast.show(`Welcome, ${payload.name}!`, "success");
      } else if (data.status === "Rejected") {
        Toast.show("Access denied by admin", "error");
      } else {
        Toast.show("Awaiting admin approval", "info");
      }
    } catch (err) {
      console.error('Login error:', err);
      UI.setLoginLoading(false);
      Toast.show("Connection error. Please try again.", "error");
    }
  }
};

// ==================== UI MANAGEMENT ====================
const UI = {
  showSection(id) {
    document.querySelectorAll('.section').forEach(s => {
      s.classList.remove('active');
      s.setAttribute('aria-hidden', 'true');
    });
    
    const activeSection = document.getElementById(id);
    activeSection.classList.add('active');
    activeSection.setAttribute('aria-hidden', 'false');
    
    // Focus management for accessibility
    const firstInput = activeSection.querySelector('input, button, select');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  },
  
  setLoginLoading(isLoading) {
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
};

// ==================== IMAGE HANDLING ====================
const ImageHandler = {
  async compress(file) {
    return new Promise((resolve, reject) => {
      // Validate file size
      const maxSize = CONFIG.IMAGE.MAX_SIZE_MB * 1024 * 1024;
      if (file.size > maxSize) {
        reject(new Error(`Image too large. Maximum size is ${CONFIG.IMAGE.MAX_SIZE_MB}MB`));
        return;
      }
      
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = e => {
        img.src = e.target.result;
      };
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        let width = img.width;
        let height = img.height;
        
        if (width > CONFIG.IMAGE.MAX_WIDTH) {
          height = height * (CONFIG.IMAGE.MAX_WIDTH / width);
          width = CONFIG.IMAGE.MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL("image/jpeg", CONFIG.IMAGE.COMPRESSION_QUALITY);
        
        // Check compressed size
        const compressedSize = Math.round((compressedBase64.length * 3) / 4);
        if (compressedSize > maxSize) {
          reject(new Error("Compressed image still too large"));
          return;
        }
        
        resolve(compressedBase64);
      };
      
      img.onerror = () => reject(new Error("Failed to load image"));
      reader.onerror = () => reject(new Error("Failed to read file"));
      
      reader.readAsDataURL(file);
    });
  },
  
  async preview(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const uploadDiv = document.querySelector('.photo-upload');
    const placeholder = uploadDiv.querySelector('.placeholder');
    
    try {
      const compressedBase64 = await this.compress(file);
      
      AppState.compressedImageBase64 = compressedBase64;
      
      let img = uploadDiv.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        img.className = "photo-preview";
        uploadDiv.appendChild(img);
      }
      
      img.src = compressedBase64;
      uploadDiv.classList.add("has-image");
      if (placeholder) placeholder.style.display = "none";
      
    } catch (err) {
      console.error('Image compression error:', err);
      Toast.show(err.message || "Failed to process image", "error");
      
      // Reset file input
      event.target.value = '';
    }
  }
};

// ==================== FORM HANDLING ====================
const FormHandler = {
  validate() {
    const date = document.getElementById("date").value;
    const volume = document.getElementById("volume").value;
    const waste = document.getElementById("waste").value;
    
    const errors = [];
    
    if (!date) errors.push({ field: "date", message: "Please select a date" });
    if (!volume || parseFloat(volume) <= 0) errors.push({ field: "volume", message: "Please enter a valid volume" });
    if (!waste) errors.push({ field: "waste", message: "Please select a waste type" });
    if (!AppState.compressedImageBase64) errors.push({ field: "photo", message: "Please upload a photo" });
    
    // Clear previous errors
    document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));
    
    // Show new errors
    errors.forEach(({ field }) => {
      const group = document.getElementById(`${field}-group`);
      if (group) group.classList.add('error');
    });
    
    return errors.length === 0;
  },
  
  reset() {
    AppState.pendingRequestId = null;
    
    document.getElementById("date").value = "";
    document.getElementById("volume").value = "";
    document.getElementById("waste").value = "";
    
    const photoInput = document.getElementById("photo");
    if (photoInput) photoInput.value = null;
    
    AppState.compressedImageBase64 = "";
    
    const uploadDiv = document.querySelector(".photo-upload");
    if (uploadDiv) {
      uploadDiv.classList.remove("has-image");
      const img = uploadDiv.querySelector("img");
      if (img) img.remove();
      
      const placeholder = uploadDiv.querySelector(".placeholder");
      if (placeholder) placeholder.style.display = "block";
    }
  }
};

// ==================== API CLIENT ====================
const API = {
  async fetchWithTimeout(resource, options = {}, timeout = CONFIG.API.TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  },
  
  async submitEntry(payload) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      formData.append(key, value);
    });
    
    const response = await this.fetchWithTimeout(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  },
  
  async loadHistory(packageId, fromDate, toDate) {
    const url = `${CONFIG.SCRIPT_URL}?package=${packageId}&from=${fromDate}&to=${toDate}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  }
};

// ==================== PACKAGE MANAGEMENT ====================
const PackageManager = {
  select(pkg, element) {
    document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    AppState.selectedPackage = pkg;
  },
  
  confirm() {
    if (!AppState.selectedPackage) {
      Toast.show("Please select a package first", "warning");
      return;
    }
    UI.showSection("menu-section");
  },
  
  back() {
    AppState.selectedPackage = "";
    document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
    UI.showSection("package-section");
  }
};

// ==================== ENTRY MANAGEMENT ====================
const EntryManager = {
  async submit() {
    if (AppState.isUploading) {
      Toast.show("Please wait for the current upload to finish", "warning");
      return;
    }
    
    if (!Auth.requireAuth()) return;
    
    if (!FormHandler.validate()) {
      Toast.show("Please fill in all required fields", "error");
      return;
    }
    
    AppState.isUploading = true;
    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    
    let slowToastTimeout;
    
    try {
      // Generate unique request ID
      AppState.pendingRequestId = Utils.generateRequestId();
      
      // Show uploading toast after 2 seconds
      slowToastTimeout = setTimeout(() => {
        Toast.show("Uploading to cloud...", "info", { 
          spinner: true, 
          persistent: true 
        });
      }, 2000);
      
      const date = document.getElementById("date").value;
      const volume = document.getElementById("volume").value;
      const waste = document.getElementById("waste").value;
      
      const payload = {
        token: Auth.getToken(),
        requestId: AppState.pendingRequestId,
        package: AppState.selectedPackage,
        date: Utils.sanitizeInput(date),
        volume: parseFloat(volume),
        waste: Utils.sanitizeInput(waste),
        imageBase64: AppState.compressedImageBase64,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      
      const result = await API.submitEntry(payload);
      
      clearTimeout(slowToastTimeout);
      
      if (AppState.activeToast) {
        Toast.dismiss(AppState.activeToast);
      }
      
      if (result.success) {
        Toast.show("Entry submitted successfully!", "success");
        FormHandler.reset();
        document.getElementById('modal').classList.add('active');
      } else if (result.duplicate) {
        Toast.show("This entry was already submitted", "warning");
        FormHandler.reset();
      } else {
        Toast.show(result.error || "Submission failed", "error");
      }
      
    } catch (err) {
      clearTimeout(slowToastTimeout);
      
      if (AppState.activeToast) {
        Toast.dismiss(AppState.activeToast);
      }
      
      console.error("Upload error:", err);
      
      let userMessage = "Error submitting entry";
      
      if (err.message.includes("timeout")) {
        userMessage = "Upload timed out. Please check your connection and try again.";
      } else if (err.message.includes("network")) {
        userMessage = "Network error. Please check your internet connection.";
      }
      
      Toast.show(userMessage, "error", { duration: CONFIG.TOAST.ERROR_DURATION });
      
    } finally {
      AppState.isUploading = false;
      submitBtn.disabled = false;
    }
  }
};

// ==================== HISTORY MANAGEMENT ====================
const HistoryManager = {
  async load() {
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;
    const exportBtn = document.getElementById("exportBtn");
    
    exportBtn.disabled = true;
    
    if (!from || !to) {
      Toast.show('Please select a date range', 'error');
      return;
    }
    
    if (!AppState.selectedPackage) {
      Toast.show('No package selected', 'error');
      return;
    }
    
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    
    if (diffDays > CONFIG.HISTORY.MAX_DATE_RANGE_DAYS) {
      Toast.show(`Date range must be ${CONFIG.HISTORY.MAX_DATE_RANGE_DAYS} days or less`, 'error');
      return;
    }
    
    document.getElementById('loading').style.display = 'block';
    document.getElementById('table-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    
    try {
      const rows = await API.loadHistory(AppState.selectedPackage, from, to);
      AppState.loadedRows = rows;
      
      document.getElementById('loading').style.display = 'none';
      
      if (rows.error) {
        Toast.show(rows.error, 'error');
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
      exportBtn.disabled = false;
      
      rows.slice(1).forEach(r => {
        const date = Utils.formatDate.long(r[0]);
        
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
      Toast.show('Error loading data', 'error');
      console.error('History load error:', err);
    }
  },
  
  export() {
    const btn = document.getElementById("exportBtn");
    
    if (!AppState.loadedRows || AppState.loadedRows.length <= 1) {
      Toast.show("No data to export", "error");
      return;
    }
    
    btn.disabled = true;
    btn.textContent = "Exporting...";
    
    try {
      const rows = JSON.parse(JSON.stringify(AppState.loadedRows));
      
      rows[0] = ["Date", "Volume (kg)", "Waste Name", "Package", "User", "Photo Link", "System Timestamp"];
      
      for (let i = 1; i < rows.length; i++) {
        rows[i][0] = Utils.formatDate.short(rows[i][0]);
        
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
      
      const filename = `waste_log_${AppState.selectedPackage}_${Utils.formatDate.ISO(new Date())}.xlsx`;
      
      XLSX.writeFile(workbook, filename);
      
      Toast.show("Excel exported successfully!", "success");
      
    } catch (err) {
      console.error('Export error:', err);
      Toast.show("Export failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Export to Excel (XLSX)";
    }
  }
};

// ==================== MODAL MANAGEMENT ====================
const Modal = {
  close() {
    document.getElementById('modal').classList.remove('active');
  },
  
  openImage(url) {
    const modal = document.getElementById("imageModal");
    const img = document.getElementById("modalImage");
    
    const match = url.match(/[-\w]{25,}/);
    if (!match) {
      Toast.show("Invalid image link", "error");
      return;
    }
    
    const fileId = match[0];
    const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
    
    img.src = directUrl;
    modal.style.display = "flex";
  },
  
  closeImage() {
    const modal = document.getElementById("imageModal");
    const img = document.getElementById("modalImage");
    
    img.src = "";
    modal.style.display = "none";
  }
};

// ==================== GLOBAL FUNCTIONS (for onclick) ====================
function selectPackage(pkg, el) { PackageManager.select(pkg, el); }
function confirmPackage() { PackageManager.confirm(); }
function backToPackage() { PackageManager.back(); }
function showMenu() { UI.showSection('menu-section'); }
function showLogForm() {
  UI.showSection('form-section');
  document.getElementById('date').valueAsDate = new Date();
}
function showHistoryView() {
  UI.showSection('history-section');
  const today = new Date();
  const weekAgo = new Date(today.getTime() - CONFIG.HISTORY.DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  document.getElementById('toDate').valueAsDate = today;
  document.getElementById('fromDate').valueAsDate = weekAgo;
}
function previewImage(e) { ImageHandler.preview(e); }
function addEntry() { EntryManager.submit(); }
function closeModal() { Modal.close(); }
function loadHistory() { HistoryManager.load(); }
function exportExcel() { HistoryManager.export(); }
function openImageModal(url) { Modal.openImage(url); }
function closeImageModal() { Modal.closeImage(); }

// ==================== INITIALIZATION ====================
window.onload = function() {
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Modal.close();
      Modal.closeImage();
    }
  });
  
  // Initialize Google Sign-In
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({
      client_id: "client_id: CONFIG.GOOGLE_CLIENT_ID,",
      callback: (response) => Auth.handleGoogleLogin(response),
      auto_select: false,
      cancel_on_tap_outside: true
    });
    
    google.accounts.id.renderButton(
      document.getElementById("buttonDiv"),
      { theme: "outline", size: "large", width: "250" }
    );
  } else {
    console.error("Google Identity not loaded");
    Toast.show('Login service unavailable', 'error');
  }
};
