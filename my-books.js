// ===== Page & Pair: My Books page =====

const API_BASE = 'https://page-and-pair-api.onrender.com';

const TO_READ_KEY = 'pageAndPair.toReadBookIds';
const DISMISSED_KEY = 'pageAndPair.dismissedBookIds';
const AUTH_KEY = 'pageAndPair.auth';

const myBooksList = document.getElementById('my-books-list');

function loadToReadIds() {
  try {
    const raw = localStorage.getItem(TO_READ_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (error) {
    console.error('Could not read saved to-read list:', error);
    return new Set();
  }
}

function saveToReadIds(idSet) {
  try {
    localStorage.setItem(TO_READ_KEY, JSON.stringify(Array.from(idSet)));
  } catch (error) {
    console.error('Could not save to-read list:', error);
  }
}

function loadDismissedIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (error) {
    return new Set();
  }
}

function saveDismissedIds(idSet) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(idSet)));
  } catch (error) {
    console.error('Could not save dismissals:', error);
  }
}

function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function cleanAuthor(name) {
  return (name || '').replace(/\s*\(Goodreads Author\)/g, '');
}

let toReadIds = loadToReadIds();
let dismissedIds = loadDismissedIds();

async function loadMyBooks() {
  // If logged in, pull the server's saved "to_read" list too, in case this is a different device
  const auth = getAuth();
  if (auth) {
    try {
      const response = await fetch(API_BASE + '/api/me/book-status', {
        headers: { Authorization: 'Bearer ' + auth.token }
      });
      if (response.ok) {
        const entries = await response.json();
        entries
          .filter((entry) => entry.status === 'to_read')
          .forEach((entry) => toReadIds.add(entry.bookId));
        saveToReadIds(toReadIds);
      }
    } catch (error) {
      console.error('Could not sync saved books from server:', error);
    }
  }

  if (toReadIds.size === 0) {
    myBooksList.innerHTML = '<p class="empty-message">You haven\'t saved any books yet. Click "To Read" on a book from the Discover page to add it here.</p>';
    return;
  }

  myBooksList.innerHTML = '<p class="empty-message">Loading your books…</p>';

  try {
    const params = new URLSearchParams({ ids: Array.from(toReadIds).join(',') });
    const response = await fetch(API_BASE + '/api/books/by-ids?' + params);
    if (!response.ok) throw new Error('Request failed: ' + response.status);
    const books = await response.json();
    renderMyBooks(books);
  } catch (error) {
    console.error(error);
    myBooksList.innerHTML = '<p class="empty-message">Could not load your books. Please refresh and try again.</p>';
  }
}

function renderMyBooks(books) {
  myBooksList.innerHTML = '';

  if (books.length === 0) {
    myBooksList.innerHTML = '<p class="empty-message">You haven\'t saved any books yet. Click "To Read" on a book from the Discover page to add it here.</p>';
    return;
  }

  books.forEach((book) => {
    const card = document.createElement('article');
    card.className = 'book-card';

    const cover = document.createElement('img');
    cover.className = 'book-cover';
    cover.src = book.coverUrl || '';
    cover.alt = 'Cover of ' + book.title;
    cover.addEventListener('error', () => (cover.style.display = 'none'));

    const info = document.createElement('div');
    info.className = 'book-info';

    const title = document.createElement('h3');
    title.className = 'book-title';
    title.textContent = book.title;

    const author = document.createElement('p');
    author.className = 'book-author';
    author.textContent = 'by ' + cleanAuthor(book.author);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-action-btn';
    removeBtn.textContent = 'Remove from list';
    removeBtn.addEventListener('click', async () => {
      toReadIds.delete(book.id);
      saveToReadIds(toReadIds);

      // Also remove from the general exclude list so it can show up in recommendations again
      dismissedIds.delete(book.id);
      saveDismissedIds(dismissedIds);

    const auth = getAuth();
      if (auth) {
        try {
          await fetch(API_BASE + '/api/me/book-status/' + book.id, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + auth.token }
          });
        } catch (error) {
          console.error('Could not sync removal to server:', error);
        }
      }

      card.remove();
      if (myBooksList.children.length === 0) {
        myBooksList.innerHTML = '<p class="empty-message">You haven\'t saved any books yet. Click "To Read" on a book from the Discover page to add it here.</p>';
      }
    });

    actions.appendChild(removeBtn);
    info.append(title, author, actions);
    card.append(cover, info);
    myBooksList.appendChild(card);
  });
}

loadMyBooks();