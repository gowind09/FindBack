"use strict";

(() => {
    const DATABASE_NAME = "findback-profile-photos";
    const STORE_NAME = "pending";
    const RECORD_ID = "signup-photo";
    const BUCKET = "item-images";
    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

    function validate(file) {
        return Boolean(file && ALLOWED_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_BYTES);
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not store the selected photo."));
        });
    }

    async function withStore(mode, action) {
        const db = await openDatabase();
        try {
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, mode);
                const request = action(transaction.objectStore(STORE_NAME));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error("Could not access the selected photo."));
                transaction.onabort = () => reject(transaction.error || new Error("Could not access the selected photo."));
            });
        } finally {
            db.close();
        }
    }

    async function savePending(file) {
        if (!validate(file)) throw new Error("Choose a JPG, PNG, WebP, or GIF image up to 5 MB.");
        await withStore("readwrite", store => store.put({ id: RECORD_ID, file, type: file.type }));
    }

    async function clearPending() {
        if (!window.indexedDB) return;
        await withStore("readwrite", store => store.delete(RECORD_ID));
    }

    async function uploadPhoto(userId, file) {
        if (!validate(file)) throw new Error("Choose a JPG, PNG, WebP, or GIF image up to 5 MB.");
        if (typeof supabaseClient === "undefined" || !supabaseClient) throw new Error("Image service is unavailable.");
        const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[file.type];
        const path = `${userId}/profile/avatar-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabaseClient.storage.from(BUCKET).upload(path, file, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false
        });
        if (uploadError) throw uploadError;

        const { data, error: profileError } = await supabaseClient
            .from("profiles")
            .update({ avatar_path: path })
            .eq("id", userId)
            .select("id")
            .maybeSingle();
        if (profileError || !data) {
            await supabaseClient.storage.from(BUCKET).remove([path]);
            throw profileError || new Error("Could not save the photo to your profile.");
        }
        return path;
    }

    async function uploadPending(userId) {
        if (!window.indexedDB || !userId || typeof supabaseClient === "undefined" || !supabaseClient) return false;
        const record = await withStore("readonly", store => store.get(RECORD_ID));
        if (!record?.file) return false;
        await uploadPhoto(userId, record.file);
        await clearPending();
        return true;
    }

    window.FindBackProfilePhoto = {
        validate,
        upload: uploadPhoto,
        savePending,
        uploadPending,
        clearPending
    };
})();
