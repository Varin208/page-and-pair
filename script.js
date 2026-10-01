// ===== Page & Pair: talks to the Spring Boot API =====

const API_BASE = 'https://page-and-pair-api.onrender.com';
const BATCH_SIZE = 20;   // how many we fetch from the backend at once
const VISIBLE_COUNT = 5; // how many cards are shown at a time

const selection = { genreId: null, tropeIds: [], moodIds: [] };

// ----- Login/signup modal -----
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authTitle = document.getElementById('auth-modal-title');
const authSubtext = document.getElementById('auth-modal-subtext');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authSwitchBtn = document.getElementById('auth-switch-btn');

let authMode = 'login'; // or 'signup'

function openAuthModal() {
  authError.hidden = true;
  authForm.reset();
  authModal.hidden = false;
}

function closeAuthModal() {
  authModal.hidden = true;
}

function setAuthMode(mode) {
  authMode = mode;
  authError.hidden = true;
  if (mode === 'login') {
    authTitle.textContent = 'Log in';
    authSubtext.textContent = "Save the books you've marked as read or not interested, across devices.";
    authSubmitBtn.textContent = 'Log in';
    authSwitchText.textContent = "Don't have an account?";
    authSwitchBtn.textContent = 'Sign up';
  } else {
    authTitle.textContent = 'Sign up';
    authSubtext.textContent = 'Create an account to save your progress across devices.';
    authSubmitBtn.textContent = 'Sign up';
    authSwitchText.textContent = 'Already have an account?';
    authSwitchBtn.textContent = 'Log in';
  }
}

document.getElementById('open-login-btn').addEventListener('click', () => {
  setAuthMode('login');
  openAuthModal();
});
document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);

// Clicking the dark backdrop (not the box itself) also closes it
authModal.addEventListener('click', (event) => {
  if (event.target === authModal) closeAuthModal();
});

authSwitchBtn.addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'signup' : 'login');
});

// ----- Google Sign-In -----
function handleGoogleCredential(response) {
  // response.credential is the verified token Google gives us after the user approves
  fetch(API_BASE + '/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: response.credential })
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        authError.textContent = data.error || 'Google sign-in failed. Please try again.';
        authError.hidden = false;
        return;
      }
      setAuth({ token: data.token, email: data.email });
      closeAuthModal();
      syncSavedStatuses();
    })
    .catch((error) => {
      console.error('Google sign-in error:', error);
      authError.textContent = 'Could not reach the server. Please try again.';
      authError.hidden = false;
    });
}

// Google's script loads asynchronously, so we wait until it's ready
window.addEventListener('load', () => {
  if (typeof google === 'undefined') {
    console.error('Google Sign-In script did not load.');
    return;
  }
  google.accounts.id.initialize({
    client_id: '610256875698-bl55kt00rru2rkg96j4hdu7d08fl8iah.apps.googleusercontent.com',
    callback: handleGoogleCredential
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-button'),
    { theme: 'outline', size: 'large', width: 320 }
  );
});

// ----- NEW: dismissed books, saved across reloads -----
const DISMISSED_KEY = 'pageAndPair.dismissedBookIds';

function loadDismissedIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (error) {
    console.error('Could not read saved dismissals:', error);
    return new Set();
  }
}

function saveDismissedIds(idSet) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(idSet)));
  } catch (error) {
    console.error('Could not save dismissal:', error);
  }
}

let dismissedIds = loadDismissedIds();
let bookQueue = []; // books fetched but not yet shown

const stages = {
  genre: document.getElementById('stage-genre'),
  tropes: document.getElementById('stage-tropes'),
  mood: document.getElementById('stage-mood')
};
const genreOptions = document.getElementById('genre-options');
const tropeOptions = document.getElementById('trope-options');
const moodOptions = document.getElementById('mood-options');
const recommendationsSection = document.getElementById('recommendations');
const recommendationsList = document.getElementById('recommendations-list');

function showStage(name) {
  Object.entries(stages).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

async function fetchJson(path) {
  const response = await fetch(API_BASE + path);
  if (!response.ok) throw new Error('Request failed: ' + response.status);
  return response.json();
}

function makePill(type, name, item, onChange) {
  const label = document.createElement('label');
  label.className = 'option-choice';
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.value = item.id;
  input.addEventListener('change', () => onChange(input));
  label.appendChild(input);
  label.appendChild(document.createTextNode(item.name));
  return label;
}

function showError(message) {
  recommendationsList.innerHTML = '<p class="empty-message">' + message + '</p>';
  recommendationsSection.scrollIntoView({ behavior: 'smooth' });
}

let genresLoaded = false;
let moodsLoaded = false;

function showWakingMessage() {
  if (genresLoaded && moodsLoaded) return; // already done, don't show it
  genreOptions.innerHTML = '<p class="empty-message">Waking up the server — this can take a couple of minutes the first time. Thanks for your patience!</p>';
}

// Show the waking message if loading takes more than 2 seconds
const wakingTimer = setTimeout(showWakingMessage, 2000);

async function loadGenres() {
  try {
    const genres = await fetchJson('/api/genres');
    genresLoaded = true;
    clearTimeout(wakingTimer);
    genreOptions.innerHTML = '';
    genres.forEach((genre) => {
      genreOptions.appendChild(
        makePill('radio', 'genre', genre, () => chooseGenre(genre.id))
      );
    });
  } catch (error) {
    console.error(error);
    genreOptions.innerHTML =
      '<p class="empty-message">Could not load genres. Please refresh and try again.</p>';
  }
}

async function chooseGenre(genreId) {
  selection.genreId = genreId;
  selection.tropeIds = [];
  tropeOptions.innerHTML = '';
  try {
    const tropes = await fetchJson('/api/genres/' + genreId + '/tropes');
    tropes.forEach((trope) => {
      tropeOptions.appendChild(
        makePill('checkbox', 'trope', trope, (input) => toggle(selection.tropeIds, trope.id, input.checked))
      );
    });
    showStage('tropes');
  } catch (error) {
    console.error(error);
    showError('Could not load tropes. Please try again.');
  }
}

async function loadMoods() {
  try {
    const moods = await fetchJson('/api/moods');
    moodsLoaded = true;
    moods.forEach((mood) => {
      moodOptions.appendChild(
        makePill('checkbox', 'mood', mood, (input) => toggle(selection.moodIds, mood.id, input.checked))
      );
    });
  } catch (error) {
    console.error(error);
    moodOptions.innerHTML =
      '<p class="empty-message">Could not load moods. Please refresh and try again.</p>';
  }
}



function toggle(list, id, isOn) {
  const index = list.indexOf(id);
  if (isOn && index === -1) list.push(id);
  if (!isOn && index !== -1) list.splice(index, 1);
}

document.getElementById('hero-cta-btn').addEventListener('click', () => {
  document.getElementById('discover').scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('tropes-next-btn').addEventListener('click', () => showStage('mood'));
document.getElementById('tropes-back-btn').addEventListener('click', () => {
  document.querySelectorAll('input[name="genre"]').forEach((i) => (i.checked = false));
  showStage('genre');
});
document.getElementById('mood-back-btn').addEventListener('click', () => showStage('tropes'));

// ----- NEW: starting a search resets the queue for this search -----
document.getElementById('find-pair-btn').addEventListener('click', async () => {
  bookQueue = [];
  await fetchMoreBooks();
  showNextBatch();
});

function cleanAuthor(name) {
  return (name || '').replace(/\s*\(Goodreads Author\)/g, '');
}

// ----- NEW: ask the backend for more books, skipping ones already seen -----
async function fetchMoreBooks() {
  const params = new URLSearchParams({ genre: selection.genreId, limit: BATCH_SIZE });
  if (selection.tropeIds.length) params.set('tropes', selection.tropeIds.join(','));
  if (selection.moodIds.length) params.set('moods', selection.moodIds.join(','));
  if (dismissedIds.size) params.set('exclude', Array.from(dismissedIds).join(','));

  try {
    const results = await fetchJson('/api/books/recommendations?' + params);
    bookQueue.push(...results);
  } catch (error) {
    console.error(error);
    showError('Something went wrong finding your books. Please try again.');
  }
}

// ----- NEW: take the next VISIBLE_COUNT books from the queue and render them -----
async function showNextBatch() {
  // If we're running low, top up the queue before showing anything
  if (bookQueue.length < VISIBLE_COUNT) {
    await fetchMoreBooks();
  }

  const toShow = bookQueue.splice(0, VISIBLE_COUNT);

  if (toShow.length === 0) {
    showError("You've seen every match for this combination. Try different tropes or moods.");
    return;
  }

  renderRecommendations(toShow);
}

// ----- NEW: dismiss one card, save it, and pull in a replacement -----
async function dismissBook(bookId, status, cardElement) {
  dismissedIds.add(bookId);
  saveDismissedIds(dismissedIds);

  // If logged in, also save this choice to the backend so it's remembered on other devices
  const auth = getAuth();
  if (auth) {
    try {
      await fetch(API_BASE + '/api/me/book-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + auth.token
        },
        body: JSON.stringify({ bookId, status })
      });
    } catch (error) {
      console.error('Could not save status to server:', error);
      // Not fatal: the choice is still saved locally in dismissedIds
    }
  }

  if (bookQueue.length < 1) {
    await fetchMoreBooks();
  }
  const nextBook = bookQueue.shift();

  if (nextBook) {
    cardElement.replaceWith(buildCard(nextBook, dismissBook));
  } else {
    cardElement.remove();
    if (recommendationsList.children.length === 0) {
      showError("You've seen every match for this combination. Try different tropes or moods.");
    }
  }
}

// ----- NEW: card building split into its own function so a replacement card
// can be built the same way as the initial ones -----
function buildCard(book, onDismiss) {
  const card = document.createElement('article');
  card.className = 'book-card';

  const rank = document.createElement('div');
  rank.className = 'book-rank';
  rank.textContent = book.matchPercent + '%';

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

  const score = document.createElement('p');
  score.className = 'match-score';
  score.textContent = book.matchPercent + '% Match';

  const reasons = document.createElement('ul');
  reasons.className = 'reason-list';
  book.reasons.forEach((reason) => {
    const li = document.createElement('li');
    li.className = reason.matched ? 'reason-match' : 'reason-miss';
    li.textContent = (reason.matched ? '✓ ' : '✗ ') + reason.name;
    reasons.appendChild(li);
  });

  // NEW: the two dismiss buttons
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const readBtn = document.createElement('button');
  readBtn.className = 'card-action-btn';
  readBtn.textContent = 'Already Read';
  readBtn.addEventListener('click', () => onDismiss(book.id, 'read', card));

  const skipBtn = document.createElement('button');
  skipBtn.className = 'card-action-btn';
  skipBtn.textContent = 'Not Interested';
  skipBtn.addEventListener('click', () => onDismiss(book.id, 'not_interested', card));

  actions.append(readBtn, skipBtn);
  info.append(title, author, score, reasons, actions);
  card.append(rank, cover, info);
  return card;
}

function renderRecommendations(results) {
  recommendationsList.innerHTML = '';
  results.forEach((book) => {
    recommendationsList.appendChild(buildCard(book, dismissBook));
  });
  recommendationsSection.scrollIntoView({ behavior: 'smooth' });
}

// ----- Logged-in state -----
const AUTH_KEY = 'pageAndPair.auth'; // stores { token, email }

function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Could not read saved login:', error);
    return null;
  }
}

function setAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  updateLoginButton();
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  updateLoginButton();
}

function updateLoginButton() {
  const auth = getAuth();
  const openLoginBtn = document.getElementById('open-login-btn');
  const loginPrompt = document.querySelector('.login-prompt');
  if (auth) {
    loginPrompt.innerHTML = 'Logged in as ' + auth.email + ' · <button class="link-button" id="logout-btn">Log out</button>';
    document.getElementById('logout-btn').addEventListener('click', () => {
      clearAuth();
    });
  } else {
    loginPrompt.innerHTML = '<button class="link-button" id="open-login-btn">Log in</button> to save your progress';
    document.getElementById('open-login-btn').addEventListener('click', () => {
      setAuthMode('login');
      openAuthModal();
    });
  }
}

// ----- Pull the user's saved statuses into dismissedIds after login -----
async function syncSavedStatuses() {
  const auth = getAuth();
  if (!auth) return;
  try {
    const response = await fetch(API_BASE + '/api/me/book-status', {
      headers: { Authorization: 'Bearer ' + auth.token }
    });
    if (!response.ok) throw new Error('Failed to load saved statuses');
    const entries = await response.json();
    entries.forEach((entry) => dismissedIds.add(entry.bookId));
    saveDismissedIds(dismissedIds);
  } catch (error) {
    console.error(error);
  }
}

// ----- Form submit: register or login -----
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.hidden = true;
  authSubmitBtn.disabled = true;

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

  try {
    const response = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();

    if (!response.ok) {
      authError.textContent = data.error || 'Something went wrong. Please try again.';
      authError.hidden = false;
      return;
    }

    setAuth({ token: data.token, email: data.email });
    closeAuthModal();
    await syncSavedStatuses();
  } catch (error) {
    console.error(error);
    authError.textContent = 'Could not reach the server. Please try again.';
    authError.hidden = false;
  } finally {
    authSubmitBtn.disabled = false;
  }
});

// Restore login state on page load
updateLoginButton();
if (getAuth()) syncSavedStatuses();

loadGenres();
loadMoods();

