"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const threadList = document.getElementById("chatPageThreads");
    const messageList = document.getElementById("chatPageMessages");
    const composer = document.getElementById("chatPageComposer");
    const input = document.getElementById("chatPageInput");
    const fileInput = document.getElementById("chatPageFile");
    const selectedFilePanel = document.getElementById("chatSelectedFile");
    const status = document.getElementById("chatPageStatus");
    let currentUserId = null;
    let activeChat = null;
    let activeFilter = "lost";
    let allChats = [];
    let selectedFile = null;
    const signedUrlCache = new Map();
    let refreshTimer = null;

    const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);

    const setStatus = (message, error = false) => {
        status.textContent = message;
        status.classList.toggle("error", error);
    };

    if (!supabaseClient) {
        threadList.innerHTML = `<p class="chat-page-empty">Chats could not connect. Reload the page to try again.</p>`;
        return;
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
        threadList.innerHTML = `<p class="chat-page-empty">Sign in to see your conversations. <a href="login.html">Log in</a></p>`;
        messageList.innerHTML = `<div class="chat-welcome"><strong>Your chats stay private</strong><p>Sign in to continue a conversation or start one from a report.</p></div>`;
        return;
    }
    currentUserId = user.id;

    function chatCategory(chat) {
        const linkedReport = chat.related_item?.user_id === currentUserId ? chat.related_item : chat.report_item;
        return linkedReport?.item_type || "lost";
    }

    function renderThreads(preferredChatId = activeChat?.id) {
        const chats = allChats.filter(chat => chatCategory(chat) === activeFilter);
        if (!chats.length) {
            threadList.innerHTML = `<p class="chat-page-empty">No ${activeFilter} conversations yet. Start a chat from a matching report.</p>`;
            activeChat = null;
            composer.hidden = true;
            document.getElementById("chatPageHeader").innerHTML = `<span class="chat-name-avatar">F</span><div><strong>${activeFilter === "lost" ? "Lost chats" : "Found chats"}</strong><span>FindBack</span></div>`;
            messageList.innerHTML = `<div class="chat-welcome"><strong>${activeFilter === "lost" ? "Lost item chats" : "Found item chats"}</strong><p>Choose a conversation or start one from a report.</p></div>`;
            return;
        }
        threadList.innerHTML = chats.map(chat => {
            const otherName = chat.reporter_id === currentUserId ? chat.participant_name : chat.reporter_name;
            const linkedReport = chat.related_item?.user_id === currentUserId ? chat.related_item : chat.report_item;
            const itemName = linkedReport?.item_name || "Report conversation";
            return `<button type="button" class="chat-page-thread ${chat.id === preferredChatId ? "selected" : ""}" data-chat-id="${escapeHTML(chat.id)}" aria-label="Chat with ${escapeHTML(otherName)} about ${escapeHTML(itemName)}"><span class="chat-name-avatar">${escapeHTML((otherName || "F").trim().charAt(0).toUpperCase())}</span><span class="chat-page-thread-copy"><strong>${escapeHTML(otherName || "FindBack user")}</strong><span>${escapeHTML(itemName)} · ${escapeHTML(linkedReport?.tracking_id || "FindBack")}</span></span></button>`;
        }).join("");

        threadList.querySelectorAll("[data-chat-id]").forEach(button => {
            button.addEventListener("click", () => openChat(chats.find(chat => chat.id === button.dataset.chatId)));
        });
        const chatToOpen = chats.find(chat => chat.id === preferredChatId) || chats[0];
        if (chatToOpen && chatToOpen.id !== activeChat?.id) openChat(chatToOpen);
    }

    async function loadThreads(preferredChatId = activeChat?.id) {
        const { data, error } = await supabaseClient.from("item_chats")
            .select("id,item_id,related_item_id,reporter_id,participant_id,reporter_name,participant_name,created_at,report_item:items!item_chats_item_id_fkey(item_name,tracking_id,item_type),related_item:items!item_chats_related_item_id_fkey(id,item_name,tracking_id,item_type,user_id)")
            .order("created_at", { ascending: false });
        if (error) {
            threadList.innerHTML = `<p class="chat-page-empty">Could not load chats. Please refresh the page.</p>`;
            setStatus(error.message || "Could not load chats.", true);
            return;
        }
        allChats = data || [];
        const requestedChatId = new URLSearchParams(window.location.search).get("chat");
        const requestedChat = allChats.find(chat => chat.id === requestedChatId);
        if (!preferredChatId && requestedChat) {
            activeFilter = chatCategory(requestedChat);
            document.querySelectorAll("[data-chat-filter]").forEach(tab => {
                const selected = tab.dataset.chatFilter === activeFilter;
                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
            });
            preferredChatId = requestedChat.id;
        }
        if (!allChats.length) {
            threadList.innerHTML = `<p class="chat-page-empty">No conversations yet. Open a report and select “Message reporter” to start one.</p>`;
            activeChat = null;
            composer.hidden = true;
            messageList.innerHTML = `<div class="chat-welcome"><strong>Your FindBack conversations</strong><p>Choose a chat to continue or start a new one from any report.</p></div>`;
            return;
        }
        renderThreads(preferredChatId);
    }

    async function openChat(chat) {
        if (!chat) return;
        activeChat = chat;
        threadList.querySelectorAll(".chat-page-thread").forEach(button => button.classList.toggle("selected", button.dataset.chatId === chat.id));
        const otherName = chat.reporter_id === currentUserId ? chat.participant_name : chat.reporter_name;
        const linkedReport = chat.related_item?.user_id === currentUserId ? chat.related_item : chat.report_item;
        const itemName = linkedReport?.item_name || "Report conversation";
        const trackingId = linkedReport?.tracking_id || "FindBack report";
        const initial = (otherName || "F").trim().charAt(0).toUpperCase();
        document.getElementById("chatPageHeader").innerHTML = `<span class="chat-name-avatar">${escapeHTML(initial)}</span><div><strong>${escapeHTML(otherName || "FindBack user")}</strong><span>${escapeHTML(itemName)} · ${escapeHTML(trackingId)}</span></div>`;
        composer.hidden = false;
        setStatus("");
        await loadMessages();
    }

    async function loadMessages() {
        if (!activeChat) return;
        const { data, error } = await supabaseClient.from("item_chat_messages")
            .select("id,sender_id,body,created_at,attachment_path,attachment_name,attachment_mime_type,attachment_size")
            .eq("chat_id", activeChat.id)
            .order("created_at", { ascending: true });
        if (error) {
            setStatus(error.message || "Could not load messages.", true);
            return;
        }
        const messages = data || [];
        if (!messages.length) {
            messageList.innerHTML = `<div class="chat-welcome"><strong>This is the beginning of your conversation</strong><p>Send a message to discuss the report.</p></div>`;
            return;
        }
        const renderedMessages = await Promise.all(messages.map(async message => {
            const isReporter = message.sender_id === activeChat.reporter_id;
            const senderName = isReporter ? activeChat.reporter_name : activeChat.participant_name;
            const sentAt = new Date(message.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
            const attachment = message.attachment_path ? await renderAttachment(message) : "";
            return `<article class="chat-page-bubble ${message.sender_id === currentUserId ? "mine" : ""}"><strong>${escapeHTML(senderName || "FindBack user")}</strong>${message.body ? `<p>${escapeHTML(message.body)}</p>` : ""}${attachment}<time>${escapeHTML(sentAt)}</time></article>`;
        }));
        messageList.innerHTML = renderedMessages.join("");
        messageList.scrollTop = messageList.scrollHeight;
    }

    async function renderAttachment(message) {
        const cache = signedUrlCache.get(message.attachment_path);
        let url = cache?.expiresAt > Date.now() ? cache.url : null;
        if (!url) {
            const { data, error } = await supabaseClient.storage.from("chat-attachments").createSignedUrl(message.attachment_path, 300);
            if (error || !data?.signedUrl) return `<div class="chat-attachment-card">Attachment unavailable</div>`;
            url = data.signedUrl;
            signedUrlCache.set(message.attachment_path, { url, expiresAt: Date.now() + 240000 });
        }
        const mime = message.attachment_mime_type || "application/octet-stream";
        const name = escapeHTML(message.attachment_name || "Attachment");
        const safeUrl = escapeHTML(url);
        if (mime.startsWith("image/")) return `<button type="button" class="chat-image-preview" data-attachment-preview="${safeUrl}" data-attachment-mime="${escapeHTML(mime)}" data-attachment-name="${name}"><img src="${safeUrl}" alt="${name}" loading="lazy"><span>${name}</span></button>`;
        if (mime.startsWith("video/")) return `<div class="chat-attachment-card"><span>${name}</span><video controls preload="metadata" src="${safeUrl}"></video></div>`;
        if (mime.startsWith("audio/")) return `<div class="chat-attachment-card"><span>${name}</span><audio controls preload="metadata" src="${safeUrl}"></audio></div>`;
        if (mime === "application/pdf") return `<button type="button" class="chat-file-preview" data-attachment-preview="${safeUrl}" data-attachment-mime="${escapeHTML(mime)}" data-attachment-name="${name}">📄 ${name} · View PDF</button>`;
        return `<a class="chat-file-preview" href="${safeUrl}" target="_blank" rel="noopener" download="${name}">📎 ${name} · Open file</a>`;
    }

    function showAttachmentPreview(button) {
        const mime = button.dataset.attachmentMime || "";
        const name = button.dataset.attachmentName || "Attachment";
        const url = button.dataset.attachmentPreview;
        const dialog = document.createElement("dialog");
        dialog.className = "chat-attachment-dialog";
        const content = mime === "application/pdf"
            ? `<iframe src="${escapeHTML(url)}" title="${escapeHTML(name)}"></iframe>`
            : `<img src="${escapeHTML(url)}" alt="${escapeHTML(name)}">`;
        dialog.innerHTML = `<div class="chat-attachment-dialog-head"><strong>${escapeHTML(name)}</strong><button type="button" aria-label="Close preview">×</button></div>${content}`;
        document.body.appendChild(dialog);
        dialog.querySelector("button").addEventListener("click", () => dialog.close());
        dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        dialog.showModal();
    }

    function setSelectedFile(file) {
        selectedFile = file;
        selectedFilePanel.hidden = !file;
        selectedFilePanel.querySelector("span").textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "";
        fileInput.value = "";
    }

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) {
            setSelectedFile(null);
            setStatus("Files must be 15 MB or smaller.", true);
            return;
        }
        const supportedTypes = new Set([
            "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain",
            "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/zip", "video/mp4", "audio/mpeg", "audio/mp4", "audio/ogg"
        ]);
        if (!supportedTypes.has(file.type)) {
            setSelectedFile(null);
            setStatus("Choose a supported image, document, audio, or video file.", true);
            return;
        }
        setStatus("");
        setSelectedFile(file);
    });
    document.getElementById("removeChatFile").addEventListener("click", () => setSelectedFile(null));
    messageList.addEventListener("click", event => {
        const previewButton = event.target.closest("[data-attachment-preview]");
        if (previewButton) showAttachmentPreview(previewButton);
    });

    composer.addEventListener("submit", async event => {
        event.preventDefault();
        if (!activeChat) return;
        const body = input.value.trim();
        if (!body && !selectedFile) return;
        const button = composer.querySelector("button[type='submit']");
        button.disabled = true;
        let attachment = {};
        let uploadedPath = null;
        try {
            if (selectedFile) {
                const safeName = selectedFile.name.replace(/[^\w.\- ]/g, "_").slice(-120) || "attachment";
                uploadedPath = `${activeChat.id}/${currentUserId}/${crypto.randomUUID()}-${safeName}`;
                const { error: uploadError } = await supabaseClient.storage.from("chat-attachments").upload(uploadedPath, selectedFile, { contentType: selectedFile.type, upsert: false });
                if (uploadError) throw uploadError;
                attachment = { attachment_path: uploadedPath, attachment_name: selectedFile.name, attachment_mime_type: selectedFile.type, attachment_size: selectedFile.size };
            }
            const { error } = await supabaseClient.from("item_chat_messages").insert({ chat_id: activeChat.id, sender_id: currentUserId, body: body || null, ...attachment });
            if (error) throw error;
        } catch (error) {
            if (uploadedPath) await supabaseClient.storage.from("chat-attachments").remove([uploadedPath]);
            setStatus(error.message || "Could not send your message.", true);
            button.disabled = false;
            return;
        }
        button.disabled = false;
        input.value = "";
        setSelectedFile(null);
        setStatus("");
        await loadMessages();
    });

    document.querySelectorAll("[data-chat-filter]").forEach(button => button.addEventListener("click", () => {
        activeFilter = button.dataset.chatFilter;
        document.querySelectorAll("[data-chat-filter]").forEach(tab => {
            const selected = tab === button;
            tab.classList.toggle("active", selected);
            tab.setAttribute("aria-selected", String(selected));
        });
        activeChat = null;
        composer.hidden = true;
        renderThreads();
    }));
    document.getElementById("refreshChatPage").addEventListener("click", () => loadThreads());
    await loadThreads();
    refreshTimer = window.setInterval(() => { if (activeChat) loadMessages(); }, 5000);
    window.addEventListener("beforeunload", () => window.clearInterval(refreshTimer), { once: true });
});
