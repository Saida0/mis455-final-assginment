const BASE = "https://www.themealdb.com/api/json/v1/1/";
const $ = (id) => document.getElementById(id);
const queryEl = $("query"), cuisineEl = $("cuisine");
const statusEl = $("status"), resultsEl = $("results");

// MealDB mixes country names (India) and cuisine names (Indian). Show cuisine names only.
const CUISINE = {
  india:"Indian", bangladesh:"Bangladeshi", pakistan:"Pakistani", nepal:"Nepali", "sri lanka":"Sri Lankan",
  china:"Chinese", japan:"Japanese", korea:"Korean", "south korea":"Korean", thailand:"Thai", vietnam:"Vietnamese",
  malaysia:"Malaysian", indonesia:"Indonesian", philippines:"Filipino", singapore:"Singaporean", taiwan:"Taiwanese",
  cambodia:"Cambodian", italy:"Italian", france:"French", spain:"Spanish", portugal:"Portuguese", greece:"Greek",
  germany:"German", netherlands:"Dutch", holland:"Dutch", ireland:"Irish", poland:"Polish", russia:"Russian",
  ukraine:"Ukrainian", croatia:"Croatian", slovakia:"Slovakian", norway:"Norwegian", sweden:"Swedish",
  denmark:"Danish", finland:"Finnish", switzerland:"Swiss", turkey:"Turkish", "türkiye":"Turkish", syria:"Syrian",
  lebanon:"Lebanese", iran:"Iranian", iraq:"Iraqi", israel:"Israeli", "saudi arabia":"Saudi Arabian",
  egypt:"Egyptian", morocco:"Moroccan", tunisia:"Tunisian", algeria:"Algerian", kenya:"Kenyan",
  nigeria:"Nigerian", ethiopia:"Ethiopian", "south africa":"South African", usa:"American",
  "united states":"American", america:"American", uk:"British", "united kingdom":"British", england:"British",
  britain:"British", canada:"Canadian", mexico:"Mexican", jamaica:"Jamaican", cuba:"Cuban", brazil:"Brazilian",
  argentina:"Argentinian", argentine:"Argentinian", uruguay:"Uruguayan", venezuela:"Venezuelan",
  venezulan:"Venezuelan", peru:"Peruvian", australia:"Australian", unknown:"Other"
};
function cuisineName(area) {
  const a = (area || "Unknown").trim();
  return CUISINE[a.toLowerCase()] || a;
}

const detailsCache = {};    // idMeal -> full meal
let requestId = 0;

async function getJson(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BASE + path);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Cuisine dropdown ----------
const cuisineAreas = {};   // cuisine name -> MealDB area names (India + Indian -> Indian)
let allCuisines = [];

const byCuisineOrder = (x, y) => (x === "Other") - (y === "Other") || x.localeCompare(y);

async function loadCuisines() {
  try {
    const data = await getJson("list.php?a=list");   // a single request
    (data.meals || []).forEach((m) => {
      if (!m.strArea) return;
      const c = cuisineName(m.strArea);
      (cuisineAreas[c] = cuisineAreas[c] || []).push(m.strArea);
    });
    allCuisines = Object.keys(cuisineAreas).sort(byCuisineOrder);
    setCuisineOptions(allCuisines, cuisineEl.value);
  } catch (err) { console.error(err); }
}

// Show only the given cuisines in the dropdown, keeping the selection if it is still there
function setCuisineOptions(list, selected) {
  cuisineEl.replaceChildren(new Option("All cuisines", ""));
  list.forEach((c) => cuisineEl.appendChild(new Option(c, c)));
  cuisineEl.value = list.includes(selected) ? selected : "";
}

async function fullMeal(id) {
  if (!detailsCache[id]) {
    const d = await getJson("lookup.php?i=" + id);
    detailsCache[id] = d.meals && d.meals[0];
  }
  return detailsCache[id];
}

// ---------- Recipe content ----------
const EXTRA_VIDEOS = { "53358": "https://www.youtube.com/watch?v=d3ItlXf9B9c" }; // Chicken Mandi
function youtubeUrl(meal) {
  return meal.strYoutube || EXTRA_VIDEOS[meal.idMeal] ||
    "https://www.youtube.com/results?search_query=" + encodeURIComponent(meal.strMeal + " recipe");
}

const NO_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#e8e2d4'/><text x='150' y='160' font-size='20' text-anchor='middle' fill='#5c6a6e' font-family='sans-serif'>No image</text></svg>");

function buildCard(meal) {
  const card = el("article", "meal");
  const img = el("img");
  img.src = meal.strMealThumb || NO_IMAGE;
  img.alt = meal.strMeal;
  img.loading = "lazy";
  img.onerror = () => { img.onerror = null; img.src = NO_IMAGE; };

  const info = el("div", "info");
  info.append(el("span", "tag", cuisineName(meal.strArea)), el("h2", "", meal.strMeal), el("p", "cat", meal.strCategory || ""));

  const ingDetails = el("details"), ul = el("ul");
  ingDetails.appendChild(el("summary", "", "Ingredients"));
  for (let i = 1; i <= 20; i++) {
    const name = (meal["strIngredient" + i] || "").trim();
    const measure = (meal["strMeasure" + i] || "").trim();
    if (name) ul.appendChild(el("li", "", name + (measure ? " – " + measure : "")));
  }
  if (!ul.children.length) ul.appendChild(el("li", "", "No ingredients listed."));
  ingDetails.appendChild(ul);

  const stepDetails = el("details"), steps = el("div", "steps");
  stepDetails.appendChild(el("summary", "", "How to cook"));
  const lines = (meal.strInstructions || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  (lines.length ? lines : ["No instructions listed."]).forEach((l) => steps.appendChild(el("p", "", l)));
  stepDetails.appendChild(steps);

  const link = el("a", "yt", "▶ Watch on YouTube");
  link.href = youtubeUrl(meal);
  link.target = "_blank";
  link.rel = "noopener";

  info.append(ingDetails, stepDetails, link);
  card.append(img, info);
  return card;
}

// ---------- Search ----------
// run fn on every item, a few at a time (so MealDB is not flooded)
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i]); } catch (e) { out[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const poolCache = {};   // search word -> every recipe found (so changing cuisine needs no new requests)

// every recipe with the word in its name or ingredients
async function findRecipes(term) {
  const key = term.toLowerCase();
  if (poolCache[key]) return poolCache[key];
  const byName = await getJson("search.php?s=" + encodeURIComponent(term));
  const named = byName.meals || [];
  let ingredientIds = [];
  try {
    const d = await getJson("filter.php?i=" + encodeURIComponent(term.replace(/\s+/g, "_")));
    ingredientIds = (d.meals || []).map((m) => m.idMeal);
  } catch (e) { /* ingredient search is a bonus; name results are enough */ }
  const have = new Set(named.map((m) => m.idMeal));
  const extraIds = ingredientIds.filter((id) => !have.has(id)).slice(0, 20);
  const extra = (await mapLimit(extraIds, 3, fullMeal)).filter(Boolean);
  return (poolCache[key] = named.concat(extra));
}

async function searchMeals() {
  const term = queryEl.value.trim();
  const cuisine = cuisineEl.value;
  const myRequest = ++requestId;

  if (!term && !cuisine) {
    setCuisineOptions(allCuisines, "");
    statusEl.textContent = "Type a meal or ingredient, or pick a cuisine.";
    resultsEl.replaceChildren();
    return;
  }
  statusEl.textContent = "Loading…";
  resultsEl.replaceChildren();

  try {
    let meals, selected = cuisine, note = "";

    if (term) {
      const pool = await findRecipes(term);
      if (myRequest !== requestId) return; // a newer search replaced this one

      // the dropdown lists ONLY the cuisines that have a recipe with this word
      const available = [...new Set(pool.map((m) => cuisineName(m.strArea)))].sort(byCuisineOrder);
      if (selected && !available.includes(selected)) {
        note = ' There is no "' + term + '" recipe in ' + selected + " cuisine, so all cuisines are shown.";
        selected = "";
      }
      setCuisineOptions(available, selected);
      meals = pool.filter((m) => !selected || cuisineName(m.strArea) === selected).slice(0, 5);
    } else {
      // only a cuisine was picked
      let ids = [];
      for (const area of cuisineAreas[cuisine] || [cuisine]) {
        const d = await getJson("filter.php?a=" + encodeURIComponent(area));
        ids = ids.concat((d.meals || []).map((m) => m.idMeal));
      }
      meals = (await mapLimit(ids.slice(0, 5), 3, fullMeal)).filter(Boolean);
      if (myRequest !== requestId) return;
    }

    if (!meals.length) {
      statusEl.textContent = "No meals found. Try another word.";
      return;
    }
    const parts = [];
    if (term) parts.push('"' + term + '"');
    if (selected) parts.push(selected + " cuisine");
    statusEl.textContent = "Showing " + meals.length + " result(s) for " + parts.join(" in ") + "." + note;
    resultsEl.replaceChildren(...meals.map(buildCard));
  } catch (err) {
    console.error(err);
    if (myRequest === requestId) statusEl.textContent = "Could not load meals (" + err.message + "). Wait a few seconds and press Search again.";
  }
}

$("searchBtn").addEventListener("click", searchMeals);
queryEl.addEventListener("keydown", (e) => { if (e.key === "Enter") searchMeals(); });
cuisineEl.addEventListener("change", searchMeals);

// ---------- Feedback & suggestions ----------
const FB_KEY = "mealFinderMessages";
const fbMessage = $("fbMessage"), fbStatus = $("fbStatus");
const fbType = () => document.querySelector('input[name="fbType"]:checked').value;

function loadMessages() {
  try { return JSON.parse(localStorage.getItem(FB_KEY)) || []; } catch (e) { return []; }
}
function renderMessages() {
  const list = loadMessages();
  $("fbListWrap").hidden = list.length === 0;
  $("fbList").replaceChildren(...list.map((m) => {
    const li = el("li");
    li.append(el("div", "meta", m.type + " from " + m.name + (m.rating ? " · Rating: " + m.rating + "/5" : "")), el("div", "", m.message));
    return li;
  }));
}
function updateFormType() {
  const feedback = fbType() === "Feedback";
  $("ratingRow").hidden = !feedback;
  $("fbMessageLabel").textContent = feedback ? "Your feedback" : "Your suggestion";
  fbMessage.placeholder = feedback ? "What do you like or dislike about this site?" : "Suggest a meal, a cuisine or a feature…";
}
function submitMessage() {
  const message = fbMessage.value.trim();
  fbStatus.className = "";
  if (message.length < 3) { fbStatus.className = "error"; fbStatus.textContent = "Please write a message before sending."; return; }
  const type = fbType();
  const list = loadMessages();
  list.unshift({ type, name: $("fbName").value.trim() || "Anonymous", rating: type === "Feedback" ? $("fbRating").value : "", message });
  try { localStorage.setItem(FB_KEY, JSON.stringify(list)); }
  catch (e) { fbStatus.className = "error"; fbStatus.textContent = "Could not save your message in this browser."; return; }
  fbMessage.value = "";
  fbStatus.textContent = "Thank you! Your " + type.toLowerCase() + " was sent.";
  renderMessages();
}
document.querySelectorAll('input[name="fbType"]').forEach((r) => r.addEventListener("change", updateFormType));
$("fbSubmit").addEventListener("click", submitMessage);

updateFormType();
renderMessages();
loadCuisines().then(searchMeals);
