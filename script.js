/* ==========================================================================
   PAGE & PAIR — SCRIPT.JS
   ==========================================================================
   What this file does, in order:
   1. Loads the book collection from books.json
   2. Reads which genres/tropes/moods the user checked
   3. Scores every book against those selections
   4. Ranks the books and displays the top 3, with a short explanation
      of WHY each one was recommended
   ========================================================================== */

/* --------------------------------------------------------------------------
   0. HOW SCORING WORKS (read this before the code below)
   --------------------------------------------------------------------------
   Every book is scored out of 100%, split across three categories:

     - Genre  is worth 40% of the score
     - Tropes is worth 35% of the score
     - Mood   is worth 25% of the score

   If the user skips a category entirely (e.g. picks no moods), that
   category's weight is shared out proportionally between the categories
   they DID pick, so the percentages still add up to 100%.

   Within a category, the book earns a fraction of that category's weight
   based on how MANY of the user's chosen options it matches.
   Example: user picks 2 tropes, book matches 1 of them → book earns
   half of the tropes weight.
   -------------------------------------------------------------------------- */

const CATEGORY_WEIGHTS = {
  genres: 40,
  tropes: 35,
  moods: 25
};

/* --------------------------------------------------------------------------
   1. GRAB ELEMENTS WE'LL NEED
   -------------------------------------------------------------------------- */
const heroButton = document.getElementById('hero-cta-btn');
const findPairButton = document.getElementById('find-pair-btn');
const recommendationsSection = document.getElementById('recommendations');
const recommendationsList = document.getElementById('recommendations-list');

// This will hold the book data once books.json has loaded.
let allBooks = [];

/* --------------------------------------------------------------------------
   2. LOAD THE BOOKS
   We fetch books.json as soon as the page loads, so it's ready by the
   time the user clicks "Find My Pair".
   -------------------------------------------------------------------------- */
async function loadBooks() {
  try {
    const response = await fetch('books.json');

    if (!response.ok) {
      throw new Error(`Could not load books.json (status ${response.status})`);
    }

    allBooks = await response.json();
  } catch (error) {
    console.error('Error loading books:', error);
    // If the data fails to load, tell the user in plain language
    // instead of leaving the button silently broken.
    recommendationsList.innerHTML = `
      <p class="empty-message">
        We couldn't load the book collection right now. Please refresh the page and try again.
      </p>
    `;
  }
}

loadBooks();

/* --------------------------------------------------------------------------
   3. THE HERO BUTTON JUST SCROLLS DOWN TO THE QUESTIONNAIRE
   -------------------------------------------------------------------------- */
heroButton.addEventListener('click', () => {
  document.getElementById('discover').scrollIntoView({ behavior: 'smooth' });
});

/* --------------------------------------------------------------------------
   4. READ THE USER'S SELECTIONS
   Returns an array of the checked values for a given checkbox group name,
   e.g. getCheckedValues('genre') → ["Fantasy", "Dark Romance"]
   -------------------------------------------------------------------------- */
function getCheckedValues(groupName) {
  const checkedBoxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
  return Array.from(checkedBoxes).map((box) => box.value);
}

/* --------------------------------------------------------------------------
   5. MATCHING HELPERS
   We compare strings loosely (case-insensitive, "contains" matching)
   because the user's option labels don't always match the book data
   word-for-word — e.g. the user picks "Slow Burn" but a book's trope
   list says "Slow Burn Romance". Both should count as a match.
   -------------------------------------------------------------------------- */
function isLooseMatch(selectedValue, bookValue) {
  const a = selectedValue.toLowerCase().trim();
  const b = bookValue.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
}

// Returns the subset of `selectedValues` that match at least one entry
// in `bookValues`. Used for both scoring and for the "why" explanation.
function findMatches(selectedValues, bookValues) {
  return selectedValues.filter((selected) =>
    bookValues.some((bookValue) => isLooseMatch(selected, bookValue))
  );
}

/* --------------------------------------------------------------------------
   6. SCORE A SINGLE BOOK AGAINST THE USER'S SELECTIONS
   Returns an object with the overall percentage score and the specific
   genres/tropes/moods that matched (for the explanation later).
   -------------------------------------------------------------------------- */
function scoreBook(book, selections) {
  // A book's "genre" data is its category plus its genres list combined,
  // so a pick like "Fantasy" can match either.
  const bookGenreValues = [book.category, ...book.genres];

  const matchedGenres = findMatches(selections.genres, bookGenreValues);
  const matchedTropes = findMatches(selections.tropes, book.tropes);
  const matchedMoods = findMatches(selections.moods, book.moods);

  // Figure out how many categories the user actually made picks in,
  // so we can redistribute weight away from any category they skipped.
  const activeCategories = [];
  if (selections.genres.length > 0) activeCategories.push('genres');
  if (selections.tropes.length > 0) activeCategories.push('tropes');
  if (selections.moods.length > 0) activeCategories.push('moods');

  const totalActiveWeight = activeCategories.reduce(
    (sum, category) => sum + CATEGORY_WEIGHTS[category],
    0
  );

  let score = 0;

  if (selections.genres.length > 0) {
    const genreWeight = (CATEGORY_WEIGHTS.genres / totalActiveWeight) * 100;
    score += (matchedGenres.length / selections.genres.length) * genreWeight;
  }

  if (selections.tropes.length > 0) {
    const tropeWeight = (CATEGORY_WEIGHTS.tropes / totalActiveWeight) * 100;
    score += (matchedTropes.length / selections.tropes.length) * tropeWeight;
  }

  if (selections.moods.length > 0) {
    const moodWeight = (CATEGORY_WEIGHTS.moods / totalActiveWeight) * 100;
    score += (matchedMoods.length / selections.moods.length) * moodWeight;
  }

  return {
    book,
    score: Math.round(score),
    matchedGenres,
    matchedTropes,
    matchedMoods
  };
}

/* --------------------------------------------------------------------------
   7. RANK ALL BOOKS AND RETURN THE TOP 3
   -------------------------------------------------------------------------- */
function getTopRecommendations(selections) {
  return allBooks
    .map((book) => scoreBook(book, selections))
    .filter((result) => result.score > 0) // drop books with no match at all
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/* --------------------------------------------------------------------------
   8. BUILD THE "WHY THIS BOOK" CHECKLIST
   Only the criteria the user actually selected are shown, marked with
   ✓ if the book matched them or ✗ if it didn't — this keeps the
   recommendation transparent instead of a black box.
   -------------------------------------------------------------------------- */
function buildReasonList(selections, result) {
  const allSelected = [
    ...selections.genres.map((value) => ({ value, matched: result.matchedGenres.includes(value) })),
    ...selections.tropes.map((value) => ({ value, matched: result.matchedTropes.includes(value) })),
    ...selections.moods.map((value) => ({ value, matched: result.matchedMoods.includes(value) }))
  ];

  return allSelected
    .map(({ value, matched }) => {
      const icon = matched ? '✓' : '✗';
      const className = matched ? 'reason-match' : 'reason-miss';
      return `<li class="${className}">${icon} ${value}</li>`;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   9. RENDER THE RECOMMENDATIONS TO THE PAGE
   -------------------------------------------------------------------------- */
function renderRecommendations(results, selections) {
  // Clear out whatever was there before (e.g. a previous search).
  recommendationsList.innerHTML = '';

  if (results.length === 0) {
    recommendationsList.innerHTML = `
      <p class="empty-message">
        We couldn't find a strong match for that combination yet. Try selecting a few different tropes or moods.
      </p>
    `;
    return;
  }

  results.forEach((result, index) => {
    const rank = index + 1;
    const { book, score } = result;

    const card = document.createElement('article');
    card.className = 'book-card';

    card.innerHTML = `
      <div class="book-rank">#${rank}</div>
      <img
        class="book-cover"
        src="${book.cover}"
        alt="Cover of ${book.title}"
        onerror="this.style.display='none'"
      >
      <div class="book-info">
        <h3 class="book-title">${book.title}</h3>
        <p class="book-author">by ${book.author}</p>
        <p class="match-score">${score}% Match</p>
        <ul class="reason-list">
          ${buildReasonList(selections, result)}
        </ul>
      </div>
    `;

    recommendationsList.appendChild(card);
  });
}

/* --------------------------------------------------------------------------
   10. RESET THE QUESTIONNAIRE
   Unchecks every genre/trope/mood checkbox, so if the user scrolls back
   up to try a new combination, they're starting from a blank slate.
   -------------------------------------------------------------------------- */
function resetSelections() {
  const allCheckboxes = document.querySelectorAll(
    'input[name="genre"], input[name="trope"], input[name="mood"]'
  );
  allCheckboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });
}

/* --------------------------------------------------------------------------
   11. HANDLE THE "FIND MY PAIR" SUBMIT BUTTON
   -------------------------------------------------------------------------- */
findPairButton.addEventListener('click', () => {
  const selections = {
    genres: getCheckedValues('genre'),
    tropes: getCheckedValues('trope'),
    moods: getCheckedValues('mood')
  };

  const madeAnySelection =
    selections.genres.length > 0 || selections.tropes.length > 0 || selections.moods.length > 0;

  if (!madeAnySelection) {
    recommendationsList.innerHTML = `
      <p class="empty-message">
        Pick at least one genre, trope, or mood so we know what to look for.
      </p>
    `;
    recommendationsSection.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const topResults = getTopRecommendations(selections);
  renderRecommendations(topResults, selections);
  resetSelections();

  recommendationsSection.scrollIntoView({ behavior: 'smooth' });
});