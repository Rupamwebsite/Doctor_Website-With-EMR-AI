(function () {
    const script = document.currentScript;
    const API = script.getAttribute('data-api') || (location.origin + '/api');
    const mountSel = script.getAttribute('data-target') || '#doctor-widget';
    const limit = Number(script.getAttribute('data-limit') || 8);

    function h(tag, attrs = {}, ...children) {
        const el = document.createElement(tag);
        for (const k in attrs) {
            if (k === 'style') Object.assign(el.style, attrs[k]);
            else el.setAttribute(k, attrs[k]);
        }
        children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return el;
    }

    const defaultImagePath = '/assets/images/user-default.png'; 

    fetch(API + '/doctors')
    .then(r => {
        if (!r.ok) {
            throw new Error('Network response was not ok');
        }
        return r.json();
    })
    .then(payload => {
        // কিছু ক্ষেত্রে payload-এর মধ্যে doctors ডেটা থাকতে পারে, তাই তালিকা (list) কে ঠিক করলাম।
        // ধরে নিচ্ছি, API থেকে সরাসরি একটি Array আসছে, অথবা payload.doctors-এর মধ্যে আসছে।
        const list = Array.isArray(payload) ? payload : (payload.doctors || []);
        
        const table = document.querySelector('table');
        if (!table) return;

        // Remove old rows
        table.querySelectorAll('tr:not(:first-child)').forEach(row => row.remove());

        list.forEach((d, i) => {
            const row = document.createElement('tr');

            // #
            const tdIndex = document.createElement('td');
            tdIndex.textContent = i + 1;
            row.appendChild(tdIndex);

            // Photo and Name - এই অংশটিই মূল পরিবর্তন
            const tdPhoto = document.createElement('td');
            const img = document.createElement('img');
            
            // ⭐ FIX: d.photo_path অথবা d.image_url ব্যবহার করা হলো ⭐
            // আপনার Node.js কন্ট্রোলার থেকে আসা ডাটাবেসের কলামের নাম এখানে ব্যবহার করুন।
            // আমি `d.photo_path` ও `d.image_url` দুটোকেই চেষ্টা করার ব্যবস্থা রাখলাম।
            const photoFileName = d.photo_path || d.image_url || ''; 
            
            // ছবির সোর্স তৈরি করা হলো: /uploads/ যোগ করা হলো
            // মনে রাখবেন, সার্ভারে 'uploads' ফোল্ডারটি পাবলিক করা আবশ্যক।
            const finalImageSrc = photoFileName ? `/uploads/${photoFileName}` : defaultImagePath; 

            // Photo Source
            img.src = finalImageSrc; 
            img.alt = d.first_name ? `${d.first_name} Photo` : 'Doctor Photo';
            
            // Styling
            img.style.width = '60px';
            img.style.height = '60px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            img.style.marginRight = '10px'; 
            
            // Error Handling: যদি ছবিটি লোড হতে না পারে (যেমন ফাইলটি খুঁজে না পেলে), তখন ডিফল্ট ছবি দেখাবে
            img.onerror = function() {
                this.onerror = null; // Infinite loop এড়ানোর জন্য
                this.src = defaultImagePath;
            };
            
            const doctorName = d.name || `${d.first_name || ''} ${d.last_name || ''}`.trim();
            const nameContainer = h('div', {style: {display: 'flex', alignItems: 'center'}}, img, document.createTextNode(doctorName));
            
            tdPhoto.appendChild(nameContainer);
            row.appendChild(tdPhoto);

            // Specialization
            const tdSpec = document.createElement('td');
            tdSpec.textContent = d.specialization || '';
            row.appendChild(tdSpec);
            
            // ... (বাকি কলামগুলো যেমন আছে তেমনই থাকলো) ...

            // Contact
            const tdContact = document.createElement('td');
            const contactHTML = h('div', {}, 
                h('p', { class: 'mb-0' }, d.email || 'N/A'),
                h('p', { class: 'mb-0' }, d.phone || 'N/A')
            );
            tdContact.appendChild(contactHTML);
            row.appendChild(tdContact);

            // Status
            const tdStatus = document.createElement('td');
            // d.status না থাকলে is_active প্রপার্টি চেক করা হলো
            let statusText = d.status || (d.is_active !== undefined ? (d.is_active ? 'Active' : 'Inactive') : 'N/A');
            // Status-এর জন্য একটি স্টাইলিশ ব্যাজ তৈরি করতে পারেন
            const statusClass = (statusText.toLowerCase() === 'active') ? 'badge bg-success' : 'badge bg-danger';
            const statusBadge = h('span', { class: statusClass }, statusText);
            tdStatus.appendChild(statusBadge);
            row.appendChild(tdStatus);

            // Actions (Edit | Delete)
            const tdActions = document.createElement('td');
            tdActions.textContent = 'Edit | Delete'; 
            row.appendChild(tdActions);

            table.appendChild(row);
        });
    })
    .catch(error => {
        console.error("Error fetching doctors data:", error);
    });
})();