(function () {
  const appSection = document.getElementById('app-section');
  const appBtn = document.getElementById('app-btn');
  const appInput = document.getElementById('app-input');
  const fileBtn = document.getElementById('file-btn');
  const fileInput = document.getElementById('file-input');
  const status = document.getElementById('status');

  // File status check
  const fileStatusEl = document.getElementById('file-status');

  function loadStatus() {
    fetch('/api/status')
      .then(resp => resp.json())
      .then(s => {
        const hasData = s.plistExists || s.dataExists;
        const rows = [];

        // Data file — the essential one
        if (s.dataExists) {
          rows.push(statusRow('CoreCollection.data', 'found'));
        } else if (s.plistExists) {
          rows.push(statusRow('CoreCollection.plist', 'found'));
        } else {
          rows.push(statusRow('No data file', 'missing', 'Upload one below'));
        }

        // Key — only relevant if we have data but it's not loaded (encrypted)
        if (hasData && !s.loaded && !s.keyExists) {
          rows.push(statusRow('Decryption key', 'needed', 'Enter key below to decrypt'));
        } else if (hasData && !s.loaded && s.keyExists) {
          rows.push(statusRow('Decryption key', 'found', 'Ready — reload to decrypt'));
        } else if (s.keyExists) {
          rows.push(statusRow('Decryption key', 'found'));
        }

        // Database load state
        if (s.loaded) {
          rows.push(statusRow(`${s.items} items across ${s.categories} categories`, 'found', 'Loaded'));
        } else if (hasData && s.keyExists) {
          rows.push(statusRow('Database not yet loaded', 'needed', 'Reload needed'));
        } else if (hasData) {
          rows.push(statusRow('Database not yet loaded', 'needed', 'Needs decryption key'));
        }

        fileStatusEl.innerHTML = '';
        rows.forEach(r => fileStatusEl.appendChild(r));
      })
      .catch(() => {
        fileStatusEl.textContent = '';
      });
  }

  // state: 'found', 'missing', 'needed'
  function statusRow(label, state, detail) {
    const row = document.createElement('div');
    row.className = 'file-status-row';

    const dot = document.createElement('span');
    const colorClass = state === 'found' ? 'found' : state === 'needed' ? 'needed' : 'missing';
    dot.className = 'indicator ' + colorClass;

    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = label;

    const detailEl = document.createElement('span');
    detailEl.className = 'detail';
    detailEl.textContent = detail || (state === 'found' ? 'Found' : state === 'needed' ? 'Needed' : 'Missing');

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(detailEl);
    return row;
  }

  loadStatus();

  // Key management
  const keyInput = document.getElementById('key-input');
  const keyValidateBtn = document.getElementById('key-validate-btn');
  const keyBtn = document.getElementById('key-btn');
  const keyStatus = document.getElementById('key-status');
  let savedKey = '';

  fetch('/key')
    .then(resp => {
      if (!resp.ok) throw new Error('No key set');
      return resp.text();
    })
    .then(key => {
      savedKey = key.trim();
      keyInput.value = savedKey;
      keyInput.placeholder = 'Enter hex key';
      keyBtn.disabled = true;
    })
    .catch(() => {
      keyInput.value = '';
      keyInput.placeholder = 'Enter hex key';
      keyBtn.disabled = true;
    });

  keyInput.addEventListener('input', () => {
    keyBtn.disabled = keyInput.value.trim() === savedKey;
    keyStatus.textContent = '';
    keyStatus.className = '';
  });

  keyValidateBtn.addEventListener('click', () => {
    const val = keyInput.value.trim();
    keyValidateBtn.disabled = true;
    keyStatus.className = '';
    keyStatus.textContent = 'Validating...';
    fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: val,
      })
      .then(resp => {
        if (!resp.ok) return resp.text().then(t => { throw new Error(t); });
        return resp.json();
      })
      .then(result => {
        keyStatus.className = result.valid ? 'success' : 'error';
        keyStatus.textContent = result.message;
        if (result.valid) {
          // Save the key and trigger a reload
          return fetch('/key', { method: 'POST', body: val })
            .then(() => {
              savedKey = val;
              keyBtn.disabled = true;
              return fetch('/api/reload', { method: 'POST' });
            })
            .then(() => loadStatus());
        }
      })
      .catch(err => {
        keyStatus.className = 'error';
        keyStatus.textContent = 'Validation failed: ' + err.message;
      })
      .finally(() => {
        keyValidateBtn.disabled = false;
      });
  });

  keyBtn.addEventListener('click', () => {
    const val = keyInput.value.trim();
    keyBtn.disabled = true;
    fetch('/key', { method: 'POST', body: val })
      .then(resp => {
        if (!resp.ok) throw new Error('Failed to save key');
        savedKey = val;
        keyStatus.className = 'success';
        keyStatus.textContent = 'Key saved.';
        loadStatus();
      })
      .catch(err => {
        keyStatus.className = 'error';
        keyStatus.textContent = err.message;
        keyBtn.disabled = false;
      });
  });

  // Check webkitdirectory support
  if (!('webkitdirectory' in appInput)) {
    appSection.classList.add('disabled');
    const msg = document.createElement('p');
    msg.className = 'unsupported-msg';
    msg.textContent = 'Folder upload is not supported in this browser. Use the file upload below instead.';
    appSection.appendChild(msg);
    appBtn.disabled = true;
  }

  appBtn.addEventListener('click', () => appInput.click());
  fileBtn.addEventListener('click', () => fileInput.click());

  appInput.addEventListener('change', () => {
    const files = appInput.files;
    if (!files.length) return;

    let found = null;
    for (const f of files) {
      const path = f.webkitRelativePath || '';
      if (/Contents\/Resources\/CoreCollection\.(plist|data)$/i.test(path)) {
        found = f;
        break;
      }
    }

    if (!found) {
      setStatus('error', 'No CoreCollection.plist or CoreCollection.data found in the selected .app bundle.');
      return;
    }

    upload(found);
  });

  // Drag and drop folder on the .app section
  appSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    appSection.classList.add('dragover');
  });

  appSection.addEventListener('dragleave', () => {
    appSection.classList.remove('dragover');
  });

  appSection.addEventListener('drop', (e) => {
    e.preventDefault();
    appSection.classList.remove('dragover');

    const items = e.dataTransfer.items;
    if (!items || !items.length) return;

    const entry = items[0].webkitGetAsEntry && items[0].webkitGetAsEntry();
    if (!entry) {
      setStatus('error', 'Could not read dropped item. Try using the folder picker button instead.');
      return;
    }

    if (!entry.isDirectory) {
      setStatus('error', 'Please drop a .app folder, not a single file.');
      return;
    }

    setStatus('uploading', 'Searching for CoreCollection in dropped folder...');
    findCoreCollection(entry).then(file => {
      if (!file) {
        setStatus('error', 'No CoreCollection.plist or CoreCollection.data found in the dropped folder.');
        return;
      }
      upload(file);
    }).catch(err => {
      setStatus('error', 'Error reading folder: ' + err.message);
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    upload(file);
  });

  // Drag and drop on the file upload section
  const fileSection = fileBtn.closest('.upload-section');

  fileSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileSection.classList.add('dragover');
  });

  fileSection.addEventListener('dragleave', () => {
    fileSection.classList.remove('dragover');
  });

  fileSection.addEventListener('drop', (e) => {
    e.preventDefault();
    fileSection.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    upload(file);
  });

  // Prevent default drag behavior on the whole page
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  function upload(file) {
    setStatus('uploading', `Uploading ${file.name} (${formatSize(file.size)})...`);
    appBtn.disabled = true;
    fileBtn.disabled = true;

    const form = new FormData();
    form.append('file', file);

    fetch('/api/upload', { method: 'POST', body: form })
      .then(resp => {
        if (!resp.ok) return resp.text().then(t => { throw new Error(t); });
        return resp.json();
      })
      .then(result => {
        if (result.loaded) {
          setStatus('success',
            `Loaded ${result.items} items across ${result.categories} categories. Saved to ${result.savedTo}.`
          );
        } else {
          setStatus('info',
            `File saved to ${result.savedTo}. ${result.info}`
          );
        }
        loadStatus();
      })
      .catch(err => {
        setStatus('error', `Upload failed: ${err.message}`);
      })
      .finally(() => {
        appBtn.disabled = !('webkitdirectory' in appInput);
        fileBtn.disabled = false;
        appInput.value = '';
        fileInput.value = '';
      });
  }

  function setStatus(type, message) {
    status.className = type;
    status.textContent = message;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function findCoreCollection(dirEntry) {
    return new Promise((resolve, reject) => {
      searchDir(dirEntry, (file) => resolve(file), () => resolve(null), reject);
    });
  }

  function searchDir(dirEntry, onFound, onDone, onError) {
    const reader = dirEntry.createReader();
    let pending = 0;
    let found = false;

    function readBatch() {
      reader.readEntries((entries) => {
        if (found) return;
        if (!entries.length) {
          if (pending === 0) onDone();
          return;
        }

        for (const entry of entries) {
          if (found) return;

          if (entry.isFile && /^CoreCollection\.(plist|data)$/i.test(entry.name)) {
            found = true;
            entry.file((file) => onFound(file), onError);
            return;
          }

          if (entry.isDirectory) {
            pending++;
            searchDir(entry, onFound, () => {
              pending--;
              if (pending === 0 && !found) onDone();
            }, onError);
          }
        }

        readBatch();
      }, onError);
    }

    readBatch();
  }
})();
