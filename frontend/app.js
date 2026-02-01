// StacksBoard - Collaborative Sticky Notes
// Powered by STACKS ($2/month infrastructure)

// API is proxied through Nginx - use relative URL
const pb = new PocketBase(window.location.origin);

// App State
let currentBoard = null;
let notes = [];
let zones = [];
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let isResizing = false;
let selectedNoteColor = 'yellow';
let selectedZoneColor = 'gray';

// Colors
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
const ZONE_COLORS = ['gray', 'blue', 'green', 'purple', 'orange', 'red'];

// DOM Elements
const landing = document.getElementById('landing');
const board = document.getElementById('board');
const canvas = document.getElementById('canvas');
const createModal = document.getElementById('createModal');
const shareModal = document.getElementById('shareModal');
const addNoteModal = document.getElementById('addNoteModal');
const addZoneModal = document.getElementById('addZoneModal');
const toast = document.getElementById('toast');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const boardCode = urlParams.get('board');
    
    if (boardCode) {
        document.getElementById('boardCode').value = boardCode;
    }
    
    setupEventListeners();
});

function setupEventListeners() {
    // Landing page
    document.getElementById('createBoard').addEventListener('click', () => {
        createModal.classList.remove('hidden');
    });
    
    document.getElementById('joinBoard').addEventListener('click', joinBoard);
    document.getElementById('boardCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinBoard();
    });
    
    // Create modal
    document.getElementById('cancelCreate').addEventListener('click', () => {
        createModal.classList.add('hidden');
    });
    document.getElementById('confirmCreate').addEventListener('click', createBoard);
    
    // Board actions
    document.getElementById('addNote').addEventListener('click', () => {
        selectedNoteColor = 'yellow';
        document.querySelectorAll('#addNoteModal .color-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.color === 'yellow');
        });
        addNoteModal.classList.remove('hidden');
    });
    document.getElementById('addZone').addEventListener('click', () => {
        selectedZoneColor = 'gray';
        document.querySelectorAll('#addZoneModal .color-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.color === 'gray');
        });
        document.getElementById('zoneLabel').value = '';
        addZoneModal.classList.remove('hidden');
    });
    document.getElementById('shareBoard').addEventListener('click', showShareModal);
    document.getElementById('leaveBoard').addEventListener('click', leaveBoard);
    
    // Add Note modal
    document.getElementById('cancelAddNote').addEventListener('click', () => {
        addNoteModal.classList.add('hidden');
    });
    document.getElementById('confirmAddNote').addEventListener('click', () => {
        addNote(selectedNoteColor);
        addNoteModal.classList.add('hidden');
    });
    
    // Note color picker in modal
    document.querySelectorAll('#addNoteModal .color-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#addNoteModal .color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedNoteColor = opt.dataset.color;
        });
    });
    
    // Add Zone modal
    document.getElementById('cancelAddZone').addEventListener('click', () => {
        addZoneModal.classList.add('hidden');
    });
    document.getElementById('confirmAddZone').addEventListener('click', () => {
        const label = document.getElementById('zoneLabel').value.trim() || 'Section';
        addZone(selectedZoneColor, label);
        addZoneModal.classList.add('hidden');
    });
    
    // Zone color picker in modal
    document.querySelectorAll('#addZoneModal .color-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#addZoneModal .color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedZoneColor = opt.dataset.color;
        });
    });
    
    // Share modal
    document.getElementById('copyLink').addEventListener('click', copyShareLink);
    document.getElementById('closeShare').addEventListener('click', () => {
        shareModal.classList.add('hidden');
    });
    
    // Canvas interactions
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Touch support
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
}

// Board Management
async function createBoard() {
    const name = document.getElementById('newBoardName').value.trim() || 'Untitled Board';
    const password = document.getElementById('newBoardPassword').value;
    
    try {
        const board = await pb.collection('boards').create({
            name: name,
            password: password || null,
            user_count: 0
        });
        
        createModal.classList.add('hidden');
        await enterBoard(board, password);
        showToast('Board created! Share the code with your team.');
    } catch (error) {
        console.error('Failed to create board:', error);
        showToast('Failed to create board. Please try again.');
    }
}

async function joinBoard() {
    const code = document.getElementById('boardCode').value.trim();
    const password = document.getElementById('boardPassword').value;
    
    if (!code) {
        showToast('Please enter a board code');
        return;
    }
    
    try {
        const board = await pb.collection('boards').getOne(code);
        
        if (board.password && board.password !== password) {
            showToast('Invalid password');
            return;
        }
        
        // Check user limit (10 max)
        if ((board.user_count || 0) >= 10) {
            showToast('Board is full (max 10 users)');
            return;
        }
        
        await enterBoard(board, password);
    } catch (error) {
        console.error('Failed to join board:', error);
        showToast('Board not found. Check the code and try again.');
    }
}

async function enterBoard(boardData, password) {
    currentBoard = boardData;
    
    window.history.pushState({}, '', `?board=${boardData.id}`);
    
    document.getElementById('boardName').textContent = boardData.name;
    document.getElementById('boardCodeDisplay').textContent = boardData.id;
    
    landing.classList.add('hidden');
    board.classList.remove('hidden');
    
    // Increment user count
    try {
        await pb.collection('boards').update(boardData.id, {
            user_count: (boardData.user_count || 0) + 1
        });
        updateUserCount((boardData.user_count || 0) + 1);
    } catch (e) {
        console.error('Failed to update user count:', e);
    }
    
    // Load existing data
    await loadZones();
    await loadNotes();
    
    // Subscribe to realtime updates
    subscribeToUpdates();
}

async function leaveBoard() {
    if (currentBoard) {
        try {
            const board = await pb.collection('boards').getOne(currentBoard.id);
            await pb.collection('boards').update(currentBoard.id, {
                user_count: Math.max(0, (board.user_count || 1) - 1)
            });
        } catch (e) {
            console.error('Failed to update user count:', e);
        }
        
        pb.collection('notes').unsubscribe();
        pb.collection('zones').unsubscribe();
        pb.collection('boards').unsubscribe();
    }
    
    currentBoard = null;
    notes = [];
    zones = [];
    canvas.innerHTML = '';
    
    board.classList.add('hidden');
    landing.classList.remove('hidden');
    
    window.history.pushState({}, '', window.location.pathname);
}

// Zones Management
async function loadZones() {
    try {
        const records = await pb.collection('zones').getList(1, 100, {
            filter: `board_id = "${currentBoard.id}"`,
            sort: 'created'
        });
        
        zones = records.items;
        renderZones();
    } catch (error) {
        console.error('Failed to load zones:', error);
    }
}

function renderZones() {
    document.querySelectorAll('.zone').forEach(z => z.remove());
    zones.forEach(zone => renderZone(zone));
}

function renderZone(zone) {
    const zoneEl = document.createElement('div');
    zoneEl.className = `zone zone-${zone.color || 'gray'}`;
    zoneEl.dataset.id = zone.id;
    zoneEl.style.left = `${zone.x || 50}px`;
    zoneEl.style.top = `${zone.y || 50}px`;
    zoneEl.style.width = `${zone.width || 300}px`;
    zoneEl.style.height = `${zone.height || 200}px`;
    
    zoneEl.innerHTML = `
        <span class="zone-label">${zone.label || 'Section'}</span>
        <button class="zone-delete" title="Delete section">🗑️</button>
        <div class="zone-resize"></div>
    `;
    
    zoneEl.querySelector('.zone-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteZone(zone.id);
    });
    
    canvas.insertBefore(zoneEl, canvas.firstChild);
}

async function addZone(color, label) {
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.random() * (canvasRect.width - 350) + 25;
    const y = Math.random() * (canvasRect.height - 250) + 25;
    
    try {
        const zone = await pb.collection('zones').create({
            board_id: currentBoard.id,
            label: label,
            color: color,
            x: Math.round(x),
            y: Math.round(y),
            width: 300,
            height: 200
        });
        
        zones.push(zone);
        renderZone(zone);
    } catch (error) {
        console.error('Failed to add zone:', error);
        showToast('Failed to add section');
    }
}

async function updateZonePosition(zoneId, x, y) {
    try {
        await pb.collection('zones').update(zoneId, { x: Math.round(x), y: Math.round(y) });
    } catch (error) {
        console.error('Failed to update zone position:', error);
    }
}

async function updateZoneSize(zoneId, width, height) {
    try {
        await pb.collection('zones').update(zoneId, { width: Math.round(width), height: Math.round(height) });
    } catch (error) {
        console.error('Failed to update zone size:', error);
    }
}

async function deleteZone(zoneId) {
    try {
        await pb.collection('zones').delete(zoneId);
        zones = zones.filter(z => z.id !== zoneId);
        const zoneEl = document.querySelector(`.zone[data-id="${zoneId}"]`);
        if (zoneEl) zoneEl.remove();
    } catch (error) {
        console.error('Failed to delete zone:', error);
        showToast('Failed to delete section');
    }
}

// Notes Management
async function loadNotes() {
    try {
        const records = await pb.collection('notes').getList(1, 100, {
            filter: `board_id = "${currentBoard.id}"`,
            sort: 'created'
        });
        
        notes = records.items;
        renderNotes();
    } catch (error) {
        console.error('Failed to load notes:', error);
    }
}

function renderNotes() {
    document.querySelectorAll('.note').forEach(n => n.remove());
    notes.forEach(note => renderNote(note));
}

function renderNote(note) {
    const noteEl = document.createElement('div');
    noteEl.className = `note note-${note.color || 'yellow'}`;
    noteEl.dataset.id = note.id;
    noteEl.style.left = `${note.x || 50}px`;
    noteEl.style.top = `${note.y || 50}px`;
    
    noteEl.innerHTML = `
        <div class="note-content" contenteditable="true">${note.text || ''}</div>
        <div class="note-footer">
            <div class="color-picker">
                ${COLORS.map(c => `
                    <div class="color-dot note-${c} ${note.color === c ? 'active' : ''}" 
                         data-color="${c}"></div>
                `).join('')}
            </div>
            <button class="note-delete" title="Delete note">🗑️</button>
        </div>
    `;
    
    const content = noteEl.querySelector('.note-content');
    content.addEventListener('blur', () => updateNoteText(note.id, content.textContent));
    content.addEventListener('mousedown', (e) => e.stopPropagation());
    content.addEventListener('touchstart', (e) => e.stopPropagation());
    
    noteEl.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            updateNoteColor(note.id, dot.dataset.color);
        });
    });
    
    noteEl.querySelector('.note-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNote(note.id);
    });
    
    canvas.appendChild(noteEl);
}

async function addNote(color) {
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.random() * (canvasRect.width - 250) + 25;
    const y = Math.random() * (canvasRect.height - 200) + 25;
    
    try {
        const note = await pb.collection('notes').create({
            board_id: currentBoard.id,
            text: '',
            color: color,
            x: Math.round(x),
            y: Math.round(y)
        });
        
        notes.push(note);
        renderNote(note);
        
        const noteEl = document.querySelector(`[data-id="${note.id}"] .note-content`);
        if (noteEl) noteEl.focus();
    } catch (error) {
        console.error('Failed to add note:', error);
        showToast('Failed to add note');
    }
}

async function updateNoteText(noteId, text) {
    try {
        await pb.collection('notes').update(noteId, { text });
    } catch (error) {
        console.error('Failed to update note:', error);
    }
}

async function updateNoteColor(noteId, color) {
    try {
        await pb.collection('notes').update(noteId, { color });
        
        const noteEl = document.querySelector(`[data-id="${noteId}"]`);
        if (noteEl) {
            COLORS.forEach(c => noteEl.classList.remove(`note-${c}`));
            noteEl.classList.add(`note-${color}`);
            noteEl.querySelectorAll('.color-dot').forEach(dot => {
                dot.classList.toggle('active', dot.dataset.color === color);
            });
        }
    } catch (error) {
        console.error('Failed to update color:', error);
    }
}

async function updateNotePosition(noteId, x, y) {
    try {
        await pb.collection('notes').update(noteId, { x: Math.round(x), y: Math.round(y) });
    } catch (error) {
        console.error('Failed to update position:', error);
    }
}

async function deleteNote(noteId) {
    try {
        await pb.collection('notes').delete(noteId);
        notes = notes.filter(n => n.id !== noteId);
        const noteEl = document.querySelector(`.note[data-id="${noteId}"]`);
        if (noteEl) noteEl.remove();
    } catch (error) {
        console.error('Failed to delete note:', error);
        showToast('Failed to delete note');
    }
}

// Drag and Drop
function handleCanvasMouseDown(e) {
    if (e.target.classList.contains('zone-resize')) {
        isResizing = true;
        draggedElement = e.target.closest('.zone');
        return;
    }
    
    const noteEl = e.target.closest('.note');
    if (noteEl && !e.target.closest('.note-content') && !e.target.closest('.color-dot') && !e.target.closest('.note-delete')) {
        startDrag(noteEl, e.clientX, e.clientY);
        return;
    }
    
    const zoneEl = e.target.closest('.zone');
    if (zoneEl && !e.target.closest('.zone-delete') && !e.target.closest('.zone-resize')) {
        startDrag(zoneEl, e.clientX, e.clientY);
        return;
    }
}

function handleTouchStart(e) {
    const touch = e.touches[0];
    
    const noteEl = e.target.closest('.note');
    if (noteEl && !e.target.closest('.note-content') && !e.target.closest('.color-dot') && !e.target.closest('.note-delete')) {
        e.preventDefault();
        startDrag(noteEl, touch.clientX, touch.clientY);
        return;
    }
    
    const zoneEl = e.target.closest('.zone');
    if (zoneEl && !e.target.closest('.zone-delete') && !e.target.closest('.zone-resize')) {
        e.preventDefault();
        startDrag(zoneEl, touch.clientX, touch.clientY);
        return;
    }
}

function startDrag(element, clientX, clientY) {
    draggedElement = element;
    const rect = element.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;
    element.classList.add('dragging');
}

function handleMouseMove(e) {
    if (isResizing && draggedElement) {
        const zoneRect = draggedElement.getBoundingClientRect();
        const newWidth = e.clientX - zoneRect.left;
        const newHeight = e.clientY - zoneRect.top;
        
        draggedElement.style.width = `${Math.max(150, newWidth)}px`;
        draggedElement.style.height = `${Math.max(100, newHeight)}px`;
        return;
    }
    
    if (!draggedElement) return;
    moveDraggedElement(e.clientX, e.clientY);
}

function handleTouchMove(e) {
    if (!draggedElement) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveDraggedElement(touch.clientX, touch.clientY);
}

function moveDraggedElement(clientX, clientY) {
    const canvasRect = canvas.getBoundingClientRect();
    const elWidth = draggedElement.offsetWidth;
    const elHeight = draggedElement.offsetHeight;
    
    let x = clientX - canvasRect.left - dragOffset.x;
    let y = clientY - canvasRect.top - dragOffset.y;
    
    x = Math.max(0, Math.min(x, canvasRect.width - elWidth));
    y = Math.max(0, Math.min(y, canvasRect.height - elHeight));
    
    draggedElement.style.left = `${x}px`;
    draggedElement.style.top = `${y}px`;
}

function handleMouseUp() {
    endDrag();
}

function handleTouchEnd() {
    endDrag();
}

function endDrag() {
    if (!draggedElement) return;
    
    draggedElement.classList.remove('dragging');
    
    const id = draggedElement.dataset.id;
    const x = parseInt(draggedElement.style.left);
    const y = parseInt(draggedElement.style.top);
    
    if (isResizing) {
        const width = parseInt(draggedElement.style.width);
        const height = parseInt(draggedElement.style.height);
        updateZoneSize(id, width, height);
        isResizing = false;
    } else if (draggedElement.classList.contains('note')) {
        updateNotePosition(id, x, y);
    } else if (draggedElement.classList.contains('zone')) {
        updateZonePosition(id, x, y);
    }
    
    draggedElement = null;
}

// Realtime Updates
function subscribeToUpdates() {
    pb.collection('notes').subscribe('*', (e) => {
        if (e.record.board_id !== currentBoard.id) return;
        
        switch (e.action) {
            case 'create':
                if (!notes.find(n => n.id === e.record.id)) {
                    notes.push(e.record);
                    renderNote(e.record);
                }
                break;
            case 'update':
                const noteIdx = notes.findIndex(n => n.id === e.record.id);
                if (noteIdx !== -1) {
                    notes[noteIdx] = e.record;
                    const noteEl = document.querySelector(`.note[data-id="${e.record.id}"]`);
                    if (noteEl && noteEl !== draggedElement) {
                        noteEl.style.left = `${e.record.x}px`;
                        noteEl.style.top = `${e.record.y}px`;
                        
                        const content = noteEl.querySelector('.note-content');
                        if (content && document.activeElement !== content) {
                            content.textContent = e.record.text;
                        }
                        
                        COLORS.forEach(c => noteEl.classList.remove(`note-${c}`));
                        noteEl.classList.add(`note-${e.record.color}`);
                        noteEl.querySelectorAll('.color-dot').forEach(dot => {
                            dot.classList.toggle('active', dot.dataset.color === e.record.color);
                        });
                    }
                }
                break;
            case 'delete':
                notes = notes.filter(n => n.id !== e.record.id);
                const delEl = document.querySelector(`.note[data-id="${e.record.id}"]`);
                if (delEl) delEl.remove();
                break;
        }
    });
    
    pb.collection('zones').subscribe('*', (e) => {
        if (e.record.board_id !== currentBoard.id) return;
        
        switch (e.action) {
            case 'create':
                if (!zones.find(z => z.id === e.record.id)) {
                    zones.push(e.record);
                    renderZone(e.record);
                }
                break;
            case 'update':
                const zoneIdx = zones.findIndex(z => z.id === e.record.id);
                if (zoneIdx !== -1) {
                    zones[zoneIdx] = e.record;
                    const zoneEl = document.querySelector(`.zone[data-id="${e.record.id}"]`);
                    if (zoneEl && zoneEl !== draggedElement) {
                        zoneEl.style.left = `${e.record.x}px`;
                        zoneEl.style.top = `${e.record.y}px`;
                        zoneEl.style.width = `${e.record.width}px`;
                        zoneEl.style.height = `${e.record.height}px`;
                    }
                }
                break;
            case 'delete':
                zones = zones.filter(z => z.id !== e.record.id);
                const delEl = document.querySelector(`.zone[data-id="${e.record.id}"]`);
                if (delEl) delEl.remove();
                break;
        }
    });
    
    pb.collection('boards').subscribe(currentBoard.id, (e) => {
        if (e.action === 'update') {
            updateUserCount(e.record.user_count);
        }
    });
}

function updateUserCount(count) {
    document.getElementById('userCount').textContent = `👥 ${count || 1}`;
}

// Share
function showShareModal() {
    const url = `${window.location.origin}${window.location.pathname}?board=${currentBoard.id}`;
    document.getElementById('shareLink').value = url;
    
    const passwordNote = document.getElementById('sharePasswordNote');
    if (currentBoard.password) {
        passwordNote.classList.remove('hidden');
    } else {
        passwordNote.classList.add('hidden');
    }
    
    shareModal.classList.remove('hidden');
}

function copyShareLink() {
    const linkInput = document.getElementById('shareLink');
    linkInput.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard!');
}

// Toast Notifications
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (currentBoard) {
        navigator.sendBeacon(`${window.location.origin}/api/collections/boards/records/${currentBoard.id}`, 
            JSON.stringify({ user_count: Math.max(0, (currentBoard.user_count || 1) - 1) }));
    }
});
