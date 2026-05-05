
// --- COPY FROM HERE ---
window.findDimmed = (textFragment) => {
    console.log(`%cSearching for elements containing: "${textFragment}"...`, 'color: cyan; font-weight: bold;');
    
    // Helper to traverse up to find significant parents
    const getPath = (el) => {
        let path = [];
        let curr = el;
        while (curr && curr.tagName !== 'BODY' && path.length < 4) {
            let name = curr.tagName.toLowerCase();
            if (curr.id) name += `#${curr.id}`;
            if (curr.className && typeof curr.className === 'string') name += `.${curr.className.trim().replace(/\s+/g, '.')}`;
            path.unshift(name);
            curr = curr.parentElement;
        }
        return path.join(' > ');
    };

    const allElements = document.querySelectorAll('*');
    let count = 0;

    allElements.forEach(el => {
        // Only look at leaf nodes or nodes with direct text content
        if (el.children.length > 0) return; 
        if (!el.textContent.includes(textFragment)) return;

        count++;
        const style = window.getComputedStyle(el);
        const parentStyle = window.getComputedStyle(el.parentElement);
        
        console.group(`%cMatch #${count}: ${getPath(el)}`, 'font-size: 1.1em;');
        console.log('Text Content:', el.textContent);
        
        console.log('%c Computed Styles ', 'background: #333; color: white; border-radius: 3px;');
        console.log('Color:', style.color);
        console.log('Opacity:', style.opacity);
        console.log('Filter:', style.filter);
        
        // Check for common transparency sources
        if (style.opacity < 1) console.warn('⚠️ Element has opacity < 1');
        if (style.color.startsWith('rgba') && !style.color.includes(', 1)')) console.warn('⚠️ Text color is RGBA with transparency');
        
        console.log('%c Parent Styles ', 'background: #333; color: white; border-radius: 3px;');
        console.log('Parent Opacity:', parentStyle.opacity);
        
        console.log('DOM Element (Right-click > Reveal in Elements):', el);
        console.groupEnd();
    });

    if (count === 0) {
        console.log('%cNo matching elements found. Try a shorter text fragment.', 'color: red;');
    } else {
        console.log(`%cFound ${count} matches. Expand the groups above to see details.`, 'color: lime;');
    }
};

console.log("%cDiagnostic Tools Loaded!", "font-size: 20px; color: #ff007f; font-weight: bold;");
console.log("Run: findDimmed('text that is dim')");
// --- END COPY ---
