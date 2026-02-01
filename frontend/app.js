// StacksBoard - Collaborative Sticky Notes
// Powered by STACKS ($2/month infrastructure)

// API is proxied through Nginx - use relative URL
const API_URL = '';
const pb = new PocketBase(window.location.origin);

// App State
let currentBoard = null;
let notes = [];
let draggedNote = null;
let dragOffset = { x: 0, y: 0 };

// Colors
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];

// DOM Elements
const landing = document.getElementById('landing');
const board = document.getElementById('board');
const canvas = document.getElementById('canvas');
const createModal = document.getElementById('createModal');
const shareModal = document.getElementById('shareModal');
const toast = document.getElementById('toast');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check for board code in URL
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
    document.getElementById('addNote').addEventListener('click', addNote);
    document.getElementById('shareBoard').addEventListener('click', showShareModal);
    document.getElementById('leaveBoard').addEventListener('click', leaveBoard);
    
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
            user_count: 1
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
        
        // Check password if required
        if (board.password && board.password !== password) {
            showToast('Invalid password');
            return;
        }
        
        // Check user limit
        if (board.user_count >= 10) {
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
    
    // Update URL
    window.history.pushState({}, '', `?board=${boardData.id}`);
    
    // Update UI
    document.getElementById('boardName').textContent = boardData.name;
    document.getElementById('boardCodeDisplay').textContent = `Code: ${boardData.id}`;
    
    landing.classList.add('hidden');
    board.classList.remove('hidden');
    
    // Increment user count
    try {
        await pb.collection('boards').update(boardData.id, {
            user_count: boardData.user_count + 1
        });
        updateUserCount(boardData.user_count + 1);
    } catch (e) {
        console.error('Failed to update user count:', e);
    }
    
    // Load existing notes
    await loadNotes();
    
    // Subscribe to realtime updates
    subscribeToUpdates();
}

async function leaveBoard() {
    if (currentBoard) {
        // Decrement user count
        try {
            const board = await pb.collection('boards').getOne(currentBoard.id);
            await pb.collection('boards').update(currentBoard.id, {
                user_count: Math.max(0, board.user_count - 1)
            });
        } catch (e) {
            console.error('Failed to update user count:', e);
        }
        
        // Unsubscribe from realtime
        pb.collection('notes').unsubscribe();
        pb.collection('boards').unsubscribe();
    }
    
    currentBoard = null;
    notes = [];
    canvas.innerHTML = '';
    
    board.classList.add('hidden');
    landing.classList.remove('hidden');
    
    window.history.pushState({}, '', window.location.pathname);
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
    canvas.innerHTML = '';
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
    
    // Event listeners
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

async function addNote() {
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.random() * (canvasRect.width - 250) + 25;
    const y = Math.random() * (canvasRect.height - 200) + 25;
    
    try {
        const note = await pb.collection('notes').create({
            board_id: currentBoard.id,
            text: '',
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            x: Math.round(x),
            y: Math.round(y)
        });
        
        // Local update (realtime will sync)
        notes.push(note);
        renderNote(note);
        
        // Focus the new note
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
        
        // Update local
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
        
        // Remove locally
        notes = notes.filter(n => n.id !== noteId);
        const noteEl = document.querySelector(`[data-id="${noteId}"]`);
        if (noteEl) noteEl.remove();
    } catch (error) {
        console.error('Failed to delete note:', error);
        showToast('Failed to delete note');
    }
}

// Drag and Drop
function handleCanvasMouseDown(e) {
    const noteEl = e.target.closest('.note');
    if (!noteEl || e.target.closest('.note-content') || e.target.closest('.color-dot') || e.target.closest('.note-delete')) {
        return;
    }
    
    startDrag(noteEl, e.clientX, e.clientY);
}

function handleTouchStart(e) {
    const noteEl = e.target.closest('.note');
    if (!noteEl || e.target.closest('.note-content') || e.target.closest('.color-dot') || e.target.closest('.note-delete')) {
        return;
    }
    
    e.preventDefault();
    const touch = e.touches[0];
    startDrag(noteEl, touch.clientX, touch.clientY);
}

function startDrag(noteEl, clientX, clientY) {
    draggedNote = noteEl;
    const rect = noteEl.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;
    noteEl.classList.add('dragging');
}

function handleMouseMove(e) {
    if (!draggedNote) return;
    moveDraggedNote(e.clientX, e.clientY);
}

function handleTouchMove(e) {
    if (!draggedNote) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveDraggedNote(touch.clientX, touch.clientY);
}

function moveDraggedNote(clientX, clientY) {
    const canvasRect = canvas.getBoundingClientRect();
    let x = clientX - canvasRect.left - dragOffset.x;
    let y = clientY - canvasRect.top - dragOffset.y;
    
    // Keep note within canvas
    x = Math.max(0, Math.min(x, canvasRect.width - 200));
    y = Math.max(0, Math.min(y, canvasRect.height - 150));
    
    draggedNote.style.left = `${x}px`;
    draggedNote.style.top = `${y}px`;
}

function handleMouseUp() {
    endDrag();
}

function handleTouchEnd() {
    endDrag();
}

function endDrag() {
    if (!draggedNote) return;
    
    draggedNote.classList.remove('dragging');
    
    const noteId = draggedNote.dataset.id;
    const x = parseInt(draggedNote.style.left);
    const y = parseInt(draggedNote.style.top);
    
    updateNotePosition(noteId, x, y);
    draggedNote = null;
}

// Realtime Updates
function subscribeToUpdates() {
    // Subscribe to notes collection
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
                    const noteEl = document.querySelector(`[data-id="${e.record.id}"]`);
                    if (noteEl && noteEl !== draggedNote) {
                        // Update position if not being dragged
                        noteEl.style.left = `${e.record.x}px`;
                        noteEl.style.top = `${e.record.y}px`;
                        
                        // Update text
                        const content = noteEl.querySelector('.note-content');
                        if (content && document.activeElement !== content) {
                            content.textContent = e.record.text;
                        }
                        
                        // Update color
                        COLORS.forEach(c => noteEl.classList.remove(`note-${c}`));
                        noteEl.classList.add(`note-${e.record.color}`);
                    }
                }
                break;
            case 'delete':
                notes = notes.filter(n => n.id !== e.record.id);
                const delEl = document.querySelector(`[data-id="${e.record.id}"]`);
                if (delEl) delEl.remove();
                break;
        }
    });
    
    // Subscribe to board updates (user count)
    pb.collection('boards').subscribe(currentBoard.id, (e) => {
        if (e.action === 'update') {
            updateUserCount(e.record.user_count);
        }
    });
}

function updateUserCount(count) {
    document.getElementById('userCount').textContent = `👥 ${count}`;
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
        // Best effort to decrement user count
        navigator.sendBeacon(`${API_URL}/api/collections/boards/records/${currentBoard.id}`, 
            JSON.stringify({ user_count: Math.max(0, currentBoard.user_count - 1) }));
    }
});
