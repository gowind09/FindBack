"use strict";

let currentUser = null;
let currentRole = null;
let allReports = [];
let allUsers = [];
let allMessages = [];

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const allowed = await checkAdminAccess();
        if (!allowed) return;
        setupNavigation();
        setupFilters();
        setupModal();
        setupLogout();
        setupAdminForm();
        await loadAdminProfile();
        await loadDashboard();
        await loadReports();
        await loadUsers();
        await loadMessages();
        await loadAdministrators();
    } catch (error) {
        console.error(error);
        showToast("Unable to load admin dashboard.", "error");
    }
});

async function checkAdminAccess() {
    if (!supabaseClient) {
        showToast("Supabase could not load. Check your internet connection and reload the page.", "error");
        return false;
    }
    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
        window.location.href = "login.html";
        return false;
    }

    currentUser = user;

    const { data: roleData, error: roleError } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

    if (roleError || !roleData) {
        window.location.href = "index.html";
        return false;
    }

    currentRole = roleData.role;

    if (!["admin", "super_admin", "president"].includes(currentRole)) {
        window.location.href = "index.html";
        return false;
    }

    const superAdminOption = document.querySelector('#newAdminRole option[value="super_admin"]');
    if (superAdminOption) superAdminOption.hidden = currentRole !== "president";

    if (!["super_admin", "president"].includes(currentRole)) {
        const adminsNav = document.getElementById("adminsNav");
        const createPanel = document.getElementById("createAdminPanel");
        if (adminsNav) adminsNav.style.display = "none";
        if (createPanel) createPanel.style.display = "none";
    }

    return true;
}

async function loadAdminProfile() {
    const { data } = await supabaseClient
        .from("profiles")
        .select("full_name,email")
        .eq("id", currentUser.id)
        .single();

    const name = data?.full_name || currentUser.email?.split("@")[0] || "Administrator";
    const email = data?.email || currentUser.email || "";

    document.getElementById("adminName").textContent = name;
    document.getElementById("adminRole").textContent = ({ president: "President", super_admin: "Super Admin", admin: "Administrator" })[currentRole] || "Administrator";
    document.getElementById("adminAvatar").textContent = name.charAt(0).toUpperCase();
}

async function loadDashboard() {
    const [users, lost, found, resolved, fake, active, admins, messages] = await Promise.all([
        supabaseClient.from("profiles").select("*", { count: "exact", head: true }),
        supabaseClient.from("items").select("*", { count: "exact", head: true }).eq("item_type", "lost"),
        supabaseClient.from("items").select("*", { count: "exact", head: true }).eq("item_type", "found"),
        supabaseClient.from("items").select("*", { count: "exact", head: true }).eq("status", "resolved"),
        supabaseClient.from("items").select("*", { count: "exact", head: true }).eq("status", "fake"),
        supabaseClient.from("items").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabaseClient.from("user_roles").select("*", { count: "exact", head: true }).in("role", ["admin", "super_admin", "president"]),
        supabaseClient.from("contact_messages").select("*", { count: "exact", head: true })
    ]);
    const failedQuery = [users, lost, found, resolved, fake, active, admins, messages].find(result => result.error);
    if (failedQuery) {
        console.error("Could not load dashboard counts:", failedQuery.error);
        showToast("Some dashboard counts could not be loaded. Check your admin access and try again.", "error");
        return;
    }
    const usersCount = users.count;
    const lostCount = lost.count;
    const foundCount = found.count;
    const resolvedCount = resolved.count;
    const fakeCount = fake.count;
    const activeCount = active.count;
    const adminCount = admins.count;
    const messageCount = messages.count;

    document.getElementById("totalUsers").textContent = usersCount || 0;
    document.getElementById("totalLost").textContent = lostCount || 0;
    document.getElementById("totalFound").textContent = foundCount || 0;
    document.getElementById("totalResolved").textContent = resolvedCount || 0;
    document.getElementById("totalFake").textContent = fakeCount || 0;
    document.getElementById("activeReports").textContent = activeCount || 0;
    document.getElementById("overviewResolved").textContent = resolvedCount || 0;
    document.getElementById("overviewFake").textContent = fakeCount || 0;
    document.getElementById("totalAdmins").textContent = adminCount || 0;
    document.getElementById("totalMessages").textContent = messageCount || 0;
}

async function loadReports() {
    const { data, error } = await supabaseClient
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Could not load reports.", "error");
        return;
    }

    allReports = data || [];
    renderReports(allReports);
    renderRecentReports(allReports.slice(0, 5));
}

function renderRecentReports(reports) {
    const body = document.getElementById("recentReportsBody");

    if (!reports.length) {
        body.innerHTML = `<tr><td colspan="5"><div class="empty-state">No reports available.</div></td></tr>`;
        return;
    }

    body.innerHTML = reports.map(item => `
        <tr>
            <td>
                <div class="item-name">${escapeHTML(item.item_name)}</div>
                <span class="item-category">${escapeHTML(item.category)} · ${escapeHTML(item.tracking_id || item.id)}</span>
            </td>
            <td><span class="badge ${item.item_type}">${capitalize(item.item_type)}</span></td>
            <td>${escapeHTML(item.location)}</td>
            <td><span class="badge ${item.status}">${capitalize(item.status)}</span></td>
            <td>${formatDate(item.created_at)}</td>
        </tr>
    `).join("");
}

function renderReports(reports) {
    const body = document.getElementById("reportsTableBody");

    if (!reports.length) {
        body.innerHTML = `<tr><td colspan="7"><div class="empty-state">No reports found.</div></td></tr>`;
        return;
    }

    body.innerHTML = reports.map(item => `
        <tr>
            <td>
                <div class="item-name">${escapeHTML(item.item_name)}</div>
                <span class="item-category">${escapeHTML(item.category)} · ${escapeHTML(item.tracking_id || item.id)}</span>
            </td>
            <td><span class="badge ${item.item_type}">${capitalize(item.item_type)}</span></td>
            <td>${escapeHTML(item.category)}</td>
            <td>${escapeHTML(item.location)}</td>
            <td><span class="badge ${item.status}">${capitalize(item.status)}</span></td>
            <td>${formatDate(item.item_date || item.created_at)}</td>
            <td>
                <div class="action-group">
                    <button class="small-btn view" onclick="viewReport('${item.id}')">View</button>
                    ${item.status !== "fake" ? `<button class="small-btn fake" onclick="markReportFake('${item.id}')">Fake</button>` : ""}
                    <button class="small-btn remove" onclick="deleteReport('${item.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join("");
}

async function viewReport(id) {
    const item = allReports.find(report => report.id === id);
    if (!item) return;

    const modalBody = document.getElementById("modalBody");

    modalBody.innerHTML = `
        ${item.image_url ? window.FindBackPhotoViewer.markup(item.image_url, "Item image", "admin-detail-photo") : ""}
        <h2>${escapeHTML(item.item_name)}</h2>
        <div class="detail-row"><strong>Tracking ID</strong><span>${escapeHTML(item.tracking_id || item.id)}</span></div>
        <div class="detail-row"><strong>Type</strong><span>${capitalize(item.item_type)}</span></div>
        <div class="detail-row"><strong>Category</strong><span>${escapeHTML(item.category)}</span></div>
        <div class="detail-row"><strong>Location</strong><span>${escapeHTML(item.location)}</span></div>
        <div class="detail-row"><strong>Date</strong><span>${formatDate(item.item_date)}</span></div>
        <div class="detail-row"><strong>Status</strong><span>${capitalize(item.status)}</span></div>
        <div class="detail-row"><strong>Contact Name</strong><span>${escapeHTML(item.contact_name || "Not provided")}</span></div>
        <div class="detail-row"><strong>Contact Email</strong><span>${escapeHTML(item.contact_email || "Not provided")}</span></div>
        <div class="detail-row"><strong>Phone</strong><span>${escapeHTML(item.contact_phone || "Not provided")}</span></div>
        <div class="detail-row"><strong>Description</strong><span>${escapeHTML(item.description)}</span></div>
    `;

    window.FindBackPhotoViewer?.protect(modalBody);
    document.getElementById("itemModal").classList.add("show");
}

async function markReportFake(id) {
    const confirmed = confirm("Mark this report as fake?");
    if (!confirmed) return;

    try {
        const { data, error } = await supabaseClient
            .from("items")
            .update({ status: "fake" })
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (error || !data) throw error || new Error("Report was not found or could not be marked as fake.");

        showToast("Report marked as fake.");
        await loadDashboard();
        await loadReports();
    } catch (error) {
        console.error("Could not mark report as fake:", error);
        showToast(error.message || "Could not mark the report as fake.", "error");
    }
}

async function deleteReport(id) {
    const confirmed = confirm("Permanently delete this report? This cannot be undone.");
    if (!confirmed) return;

    try {
        const item = allReports.find(report => report.id === id);
        const { data: deleted, error } = await supabaseClient
            .from("items")
            .delete()
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (error || !deleted) throw error || new Error("Report was not found or could not be deleted.");

        if (item?.image_url) {
            const { error: imageError } = await supabaseClient.storage.from("item-images").remove([item.image_url]);
            if (imageError) console.error("Report deleted, but its image could not be removed:", imageError);
        }

        showToast("Report deleted.");
        await loadDashboard();
        await loadReports();
    } catch (error) {
        console.error("Could not delete report:", error);
        showToast(error.message || "Could not delete the report.", "error");
    }
}

async function loadUsers() {
    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Could not load users.", "error");
        return;
    }

    allUsers = data || [];
    const userIds = allUsers.map(user => user.id);
    if (userIds.length) {
        const { data: roles, error: rolesError } = await supabaseClient
            .from("user_roles")
            .select("user_id,role")
            .in("user_id", userIds);
        if (rolesError) {
            console.error(rolesError);
            showToast("Could not load user roles.", "error");
            return;
        }
        const roleByUser = new Map((roles || []).map(item => [item.user_id, item.role]));
        allUsers = allUsers.map(user => ({ ...user, role: roleByUser.get(user.id) || "user" }));
    }
    renderUsers(allUsers);
}

function renderUsers(users) {
    const body = document.getElementById("usersTableBody");

    if (!users.length) {
        body.innerHTML = `<tr><td colspan="4"><div class="empty-state">No users found.</div></td></tr>`;
        return;
    }

    body.innerHTML = users.map(user => `
        <tr>
            <td><div class="item-name">${escapeHTML(user.full_name || "User")}</div></td>
            <td>${escapeHTML(user.email || "")}</td>
            <td><span class="badge active">${escapeHTML(({ president: "President", super_admin: "Super Admin", admin: "Admin", user: "User" })[user.role] || "User")}</span></td>
            <td>${formatDate(user.created_at)}</td>
        </tr>
    `).join("");
}

async function loadMessages() {
    const { data, error } = await supabaseClient
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Could not load feedback.", "error");
        return;
    }

    allMessages = data || [];
    renderMessages(allMessages);
}

function renderMessages(messages) {
    const container = document.getElementById("messagesContainer");

    if (!messages.length) {
        container.innerHTML = `<div class="panel empty-state">No feedback submitted yet.</div>`;
        return;
    }

    container.innerHTML = messages.map(message => `
        <article class="message-card feedback-card">
            <h3>${escapeHTML(message.subject)}</h3>
            <span class="message-email">${escapeHTML(message.name)} · ${escapeHTML(message.email)}</span>
            <p>${escapeHTML(message.message)}</p>
            <span class="message-date">${formatDate(message.created_at)}</span>
            <button class="delete-feedback-btn" type="button" data-feedback-id="${escapeHTML(message.id)}">Delete feedback</button>
        </article>
    `).join("");

    container.querySelectorAll(".delete-feedback-btn").forEach(button => {
        button.addEventListener("click", async () => {
            if (!window.confirm("Delete this feedback permanently? This cannot be undone.")) return;
            button.disabled = true;
            try {
                const { data, error } = await supabaseClient
                    .from("contact_messages")
                    .delete()
                    .eq("id", button.dataset.feedbackId)
                    .select("id")
                    .maybeSingle();
                if (error || !data) throw error || new Error("Feedback was not found or could not be deleted.");
                allMessages = allMessages.filter(message => message.id !== button.dataset.feedbackId);
                renderMessages(allMessages);
                showToast("Feedback deleted.");
                await loadDashboard();
            } catch (error) {
                console.error("Could not delete feedback:", error);
                button.disabled = false;
                showToast(error.message || "Could not delete feedback.", "error");
            }
        });
    });
}

async function loadAdministrators() {
    const { data, error } = await supabaseClient
        .from("user_roles")
        .select("user_id,role,created_at")
        .in("role", ["admin", "super_admin", "president"]);

    if (error) {
        console.error(error);
        showToast("Could not load administrators.", "error");
        return;
    }

    const roles = data || [];
    const userIds = roles.map(item => item.user_id);

    let profiles = [];

    if (userIds.length) {
        const result = await supabaseClient
            .from("profiles")
            .select("id,full_name,email")
            .in("id", userIds);

        if (result.error) {
            console.error("Could not load administrator profiles:", result.error);
            showToast("Could not load administrator profile details.", "error");
            return;
        }
        profiles = result.data || [];
    }

    const container = document.getElementById("adminList");

    if (!roles.length) {
        container.innerHTML = `<div class="empty-state">No administrators found.</div>`;
        return;
    }

    container.innerHTML = roles.map(role => {
        const profile = profiles.find(item => item.id === role.user_id);

        return `
            <div class="admin-row">
                <div class="admin-user">
                    <strong>${escapeHTML(profile?.full_name || "Administrator")}</strong>
                    <span>${escapeHTML(profile?.email || "")}</span>
                </div>
                <span class="role-badge">${escapeHTML(({ president: "President", super_admin: "Super Admin", admin: "Admin" })[role.role] || "Admin")}</span>
                ${(role.role === "admin" && ["super_admin", "president"].includes(currentRole)) || (role.role === "super_admin" && currentRole === "president") ? `<button class="remove-admin-btn" type="button" data-user-id="${escapeHTML(role.user_id)}" data-email="${escapeHTML(profile?.email || "")}" data-target-role="${escapeHTML(role.role)}">Remove</button>` : ""}
            </div>
        `;
    }).join("");

        container.querySelectorAll(".remove-admin-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const email = button.dataset.email || "this admin";
            const demotion = button.dataset.targetRole === "super_admin" ? "demote them to Admin" : "return them to a regular user";
            if (!window.confirm(`Remove elevated access for ${email} and ${demotion}?`)) return;
            button.disabled = true;
            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session) throw new Error("Session expired. Please sign in again.");
                const { data, error } = await supabaseClient.functions.invoke("remove-admin", {
                    body: { userId: button.dataset.userId },
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (error || data?.error) {
                    throw new Error(await getFunctionErrorMessage(error, data?.error || "Could not remove admin access."));
                }
                showToast("Admin access removed.");
                await loadAdministrators();
                await loadDashboard();
            } catch (error) {
                button.disabled = false;
                showToast(error.message || "Could not remove admin access.", "error");
            }
        });
    });
}

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(button => {
        button.addEventListener("click", () => {
            switchSection(button.dataset.section);
        });
    });

    document.querySelectorAll("[data-section-target]").forEach(button => {
        button.addEventListener("click", () => {
            switchSection(button.dataset.sectionTarget);
        });
    });
}

function switchSection(section) {
    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === section
        );
    });

    document.querySelectorAll(".page-section").forEach(element => {
        element.classList.remove("active-section");
    });

    const target = document.getElementById(`${section}Section`);

    if (target) {
        target.classList.add("active-section");
    }

    const titles = {
        dashboard: ["Dashboard", "Manage your FindBack platform"],
        reports: ["Reports", "Review and manage lost and found reports"],
        users: ["Users", "View registered FindBack users"],
        messages: ["Feedback", "Review feedback submitted through FindBack"],
        admins: ["Administrators", "Manage FindBack administrators"]
    };

    if (titles[section]) {
        document.getElementById("pageTitle").textContent = titles[section][0];
        document.getElementById("pageSubtitle").textContent = titles[section][1];
    }
}

function setupFilters() {
    document.getElementById("reportSearch").addEventListener("input", filterReports);
    document.getElementById("reportTypeFilter").addEventListener("change", filterReports);
    document.getElementById("reportStatusFilter").addEventListener("change", filterReports);

    document.getElementById("userSearch").addEventListener("input", function() {
        const query = this.value.toLowerCase().trim();

        const filtered = allUsers.filter(user =>
            (user.full_name || "").toLowerCase().includes(query) ||
            (user.email || "").toLowerCase().includes(query)
        );

        renderUsers(filtered);
    });
}

function filterReports() {
    const query = document.getElementById("reportSearch").value.toLowerCase().trim();
    const type = document.getElementById("reportTypeFilter").value;
    const status = document.getElementById("reportStatusFilter").value;

    const filtered = allReports.filter(item => {
        const matchesSearch =
            !query ||
            String(item.item_name || "").toLowerCase().includes(query) ||
            String(item.category || "").toLowerCase().includes(query) ||
            String(item.location || "").toLowerCase().includes(query);

        const matchesType =
            type === "all" || item.item_type === type;

        const matchesStatus =
            status === "all" || item.status === status;

        return matchesSearch && matchesType && matchesStatus;
    });

    renderReports(filtered);
}

function setupModal() {
    document.getElementById("modalClose").addEventListener("click", () => {
        document.getElementById("itemModal").classList.remove("show");
    });

    document.getElementById("itemModal").addEventListener("click", event => {
        if (event.target.id === "itemModal") {
            document.getElementById("itemModal").classList.remove("show");
        }
    });
}

function setupLogout() {
    document.getElementById("logoutBtn").addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        window.location.href = "login.html";
    });
}

function setupAdminForm() {
    const form = document.getElementById("createAdminForm");

    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!["super_admin", "president"].includes(currentRole)) {
            showToast("Only Super Admin or President can manage administrators.", "error");
            return;
        }

        const fullName = document.getElementById("newAdminName").value.trim();
        const email = document.getElementById("newAdminEmail").value.trim();
        const password = document.getElementById("newAdminPassword").value;
        const role = document.getElementById("newAdminRole").value;
        if (role === "super_admin" && currentRole !== "president") {
            showToast("Only the President can create Super Admins.", "error");
            return;
        }

        if (!fullName || !email || !password) {
            showToast("Please fill all fields.", "error");
            return;
        }

        if (password.length < 8) {
            showToast("Password must contain at least 8 characters.", "error");
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        showToast("Creating administrator...");
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                window.location.href = "login.html";
                throw new Error("Session expired. Please sign in again.");
            }

            const { data, error } = await supabaseClient.functions.invoke("create-admin", {
                body: { email, password, fullName, role }
            });
            if (error || data?.error) {
                throw new Error(await getFunctionErrorMessage(error, data?.error || "Could not create administrator."));
            }

            form.reset();
            showToast(role === "super_admin" ? "Super Admin created successfully." : "Administrator created successfully.");
            await loadDashboard();
            await loadAdministrators();
        } catch (error) {
            console.error("create-admin failed:", error);
            showToast(error.message || "Could not create administrator.", "error");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

function formatDate(date) {
    if (!date) return "N/A";

    const value = new Date(date);

    if (Number.isNaN(value.getTime())) return "N/A";

    return value.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function capitalize(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.className = `toast show ${type === "error" ? "error" : ""}`;

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.className = "toast";
    }, 3000);
}

async function getFunctionErrorMessage(error, fallback) {
    try {
        const response = error?.context;
        if (response && typeof response.json === "function") {
            const payload = await response.json();
            return payload?.error || payload?.message || payload?.msg || error.message || fallback;
        }
    } catch (parseError) {
        console.warn("Could not read Edge Function error response:", parseError);
    }
    return error?.message || fallback;
}
