const API = "/api";

// --- State ---
let pedigree = { individuals: [], relationships: [] };

// --- API helpers ---

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function loadPedigree() {
  pedigree = await api("GET", "/pedigree");
  render();
}

// --- Short ID helper ---

function shortId(uuid) {
  return uuid.slice(0, 8);
}

// --- Render ---

function render() {
  renderIndividuals();
  renderRelationships();
}

function renderIndividuals() {
  const el = document.getElementById("individuals-list");
  if (pedigree.individuals.length === 0) {
    el.innerHTML = '<p class="empty">No individuals yet.</p>';
    return;
  }
  el.innerHTML = pedigree.individuals
    .map((ind) => {
      const eventsHtml = ind.events.length
        ? `<div class="events-list">${ind.events.map(renderEvent).join("")}</div>`
        : "";
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:baseline">
            <span class="id">${shortId(ind.id)}</span>
            <span class="actions">
              <button onclick="openAddEvent('${ind.id}')">+ Event</button>
              <button class="danger" onclick="deleteIndividual('${ind.id}')">Del</button>
            </span>
          </div>
          ${eventsHtml}
        </div>`;
    })
    .join("");
}

function renderRelationships() {
  const el = document.getElementById("relationships-list");
  if (pedigree.relationships.length === 0) {
    el.innerHTML = '<p class="empty">No relationships yet.</p>';
    return;
  }
  el.innerHTML = pedigree.relationships
    .map((rel) => {
      const membersHtml = rel.members.length
        ? `<div class="members">${rel.members.map((m) => `<span class="member-badge">${shortId(m)}</span>`).join("")}</div>`
        : '<span class="empty">no members</span>';
      const eventsHtml = rel.events.length
        ? `<div class="events-list">${rel.events.map(renderEvent).join("")}</div>`
        : "";
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:baseline">
            <span class="id">${shortId(rel.id)}</span>
            <span class="actions">
              <button onclick="openAddEvent('${rel.id}')">+ Event</button>
              <button class="danger" onclick="deleteRelationship('${rel.id}')">Del</button>
            </span>
          </div>
          ${membersHtml}
          ${eventsHtml}
        </div>`;
    })
    .join("");
}

function renderEvent(ev) {
  const dateStr = ev.date ? ` <span class="event-date">${ev.date}</span>` : "";
  const propsStr = Object.keys(ev.properties).length
    ? ` <span class="event-date">${JSON.stringify(ev.properties)}</span>`
    : "";
  const refsHtml = ev.entity_references
    .map(
      (ref, i) =>
        `<span class="ref-badge">${ref.role}: ${shortId(ref.entity_id)}
          <button style="border:none;background:none;cursor:pointer;font-size:0.65rem;color:#dc2626" onclick="removeRef('${ev.id}', ${i})">&times;</button>
        </span>`
    )
    .join("");
  return `
    <div class="event-item">
      <span class="event-type">${ev.type}</span>${dateStr}${propsStr}
      <button style="border:none;background:none;cursor:pointer;font-size:0.7rem" onclick="openAddRef('${ev.id}')">+ref</button>
      <button style="border:none;background:none;cursor:pointer;font-size:0.7rem;color:#dc2626" onclick="deleteEvent('${ev.id}')">&times;</button>
      ${refsHtml ? `<div>${refsHtml}</div>` : ""}
    </div>`;
}

// --- Actions ---

async function deleteIndividual(id) {
  await api("DELETE", `/individuals/${id}`);
  loadPedigree();
}

async function deleteRelationship(id) {
  await api("DELETE", `/relationships/${id}`);
  loadPedigree();
}

async function deleteEvent(id) {
  await api("DELETE", `/events/${id}`);
  loadPedigree();
}

async function removeRef(eventId, refIndex) {
  await api("DELETE", `/events/${eventId}/references/${refIndex}`);
  loadPedigree();
}

// --- Add Individual ---

document.getElementById("btn-add-individual").addEventListener("click", async () => {
  await api("POST", "/individuals", {});
  loadPedigree();
});

// --- Add Relationship dialog ---

const dlgRel = document.getElementById("dlg-relationship");

document.getElementById("btn-add-relationship").addEventListener("click", () => {
  const container = document.getElementById("rel-member-checkboxes");
  container.innerHTML = pedigree.individuals
    .map(
      (ind) =>
        `<label style="display:block;font-weight:normal"><input type="checkbox" value="${ind.id}" /> ${shortId(ind.id)}</label>`
    )
    .join("");
  dlgRel.showModal();
});

document.getElementById("dlg-rel-cancel").addEventListener("click", () => dlgRel.close());

document.getElementById("form-relationship").addEventListener("submit", async (e) => {
  e.preventDefault();
  const checked = [...document.querySelectorAll("#rel-member-checkboxes input:checked")].map(
    (cb) => cb.value
  );
  await api("POST", "/relationships", { members: checked });
  dlgRel.close();
  loadPedigree();
});

// --- Add Event dialog ---

const dlgEvent = document.getElementById("dlg-event");

function openAddEvent(entityId) {
  document.getElementById("event-entity-id").value = entityId;
  document.getElementById("event-date").value = "";
  document.getElementById("event-props").value = "";
  dlgEvent.showModal();
}

document.getElementById("dlg-event-cancel").addEventListener("click", () => dlgEvent.close());

document.getElementById("form-event").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entityId = document.getElementById("event-entity-id").value;
  const type = document.getElementById("event-type").value;
  const date = document.getElementById("event-date").value || null;
  const propsRaw = document.getElementById("event-props").value;
  let properties = {};
  if (propsRaw) {
    try {
      properties = JSON.parse(propsRaw);
    } catch {
      alert("Invalid JSON in properties");
      return;
    }
  }

  // Determine if entity is individual or relationship
  const isIndividual = pedigree.individuals.some((i) => i.id === entityId);
  const prefix = isIndividual ? "individuals" : "relationships";

  await api("POST", `/${prefix}/${entityId}/events`, { type, date, properties });
  dlgEvent.close();
  loadPedigree();
});

// --- Add Reference dialog ---

const dlgRef = document.getElementById("dlg-ref");

function openAddRef(eventId) {
  document.getElementById("ref-event-id").value = eventId;
  document.getElementById("ref-role").value = "";
  // Populate entity select
  const sel = document.getElementById("ref-entity-id");
  sel.innerHTML = "";
  pedigree.individuals.forEach((ind) => {
    sel.innerHTML += `<option value="${ind.id}">Ind ${shortId(ind.id)}</option>`;
  });
  pedigree.relationships.forEach((rel) => {
    sel.innerHTML += `<option value="${rel.id}">Rel ${shortId(rel.id)}</option>`;
  });
  dlgRef.showModal();
}

document.getElementById("dlg-ref-cancel").addEventListener("click", () => dlgRef.close());

document.getElementById("form-ref").addEventListener("submit", async (e) => {
  e.preventDefault();
  const eventId = document.getElementById("ref-event-id").value;
  const entityId = document.getElementById("ref-entity-id").value;
  const entityType = document.getElementById("ref-entity-type").value;
  const role = document.getElementById("ref-role").value;
  await api("POST", `/events/${eventId}/references`, {
    entity_id: entityId,
    entity_type: entityType,
    role,
  });
  dlgRef.close();
  loadPedigree();
});

// --- Init ---
loadPedigree();
