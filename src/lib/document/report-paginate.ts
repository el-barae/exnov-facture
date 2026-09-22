/** Pagination mesurée, partagée par l’aperçu et l’export PDF. */
export const reportPaginationScript = `
(async function () {
  try {
    await Promise.all(['400 12pt InvoiceTable','700 12pt InvoiceTable','400 12pt InvoiceSans','700 12pt InvoiceSans'].map(font => document.fonts.load(font)));
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.decode()));
    const source = document.getElementById('source'), pages = document.getElementById('pages');
    let page, content;
    function newPage() {
      if (pages.children.length >= 60) throw new Error('Le rapport dépasse 60 pages. Demandez une version plus courte.');
      page = document.createElement('section'); page.className = 'invoice-page report-page';
      ['.watermark','.letterhead','.invoice-footer'].forEach(selector => page.append(source.querySelector(selector).cloneNode(true)));
      content = document.createElement('main'); content.className = 'page-content report-content';
      page.append(content); pages.append(page);
    }
    function fits() {
      return content.getBoundingClientRect().bottom <= page.querySelector('.invoice-footer').getBoundingClientRect().top - 14;
    }
    newPage();
    const blocks = Array.from(source.querySelector('.report-blocks').children).map(block => block.cloneNode(true));
    while (blocks.length) {
      const block = blocks.shift();
      content.append(block);
      if (fits()) {
        // Garder un titre avec le début du bloc suivant.
        if (block.matches('.report-heading') && blocks.length) {
          const probe = blocks[0].cloneNode(true);
          if (probe.matches('[data-split]')) probe.textContent = probe.textContent.slice(0, 180);
          content.append(probe); const together = fits(); probe.remove();
          if (!together && content.children.length > 1) { block.remove(); newPage(); content.append(block); }
        }
        continue;
      }
      block.remove();
      // Les paragraphes se répartissent entre les pages ; les figures restent entières.
      if (block.matches('[data-split]')) {
        content.append(block);
        const original = block.textContent;
        let low = 0, high = original.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          block.textContent = original.slice(0, mid);
          if (fits()) low = mid; else high = mid - 1;
        }
        let split = low;
        const space = original.lastIndexOf(' ', split - 1);
        if (space > split / 2) split = space + 1;
        if (split >= 80) {
          block.textContent = original.slice(0, split);
          const rest = block.cloneNode(false); rest.textContent = original.slice(split);
          blocks.unshift(rest); newPage(); continue;
        }
        block.textContent = original; block.remove();
      }
      if (!content.children.length) throw new Error('Un bloc est trop grand pour une page A4. Raccourcissez son contenu.');
      const orphan = content.lastElementChild;
      const heading = orphan && orphan.matches('.report-heading') ? orphan : null;
      if (heading) heading.remove();
      newPage(); if (heading) content.append(heading);
      content.append(block);
      if (!fits()) {
        block.remove();
        if (block.matches('[data-split]')) { blocks.unshift(block); continue; }
        throw new Error('Un titre ou une légende est trop long pour une page A4.');
      }
    }
    const count = pages.children.length;
    Array.from(pages.children).forEach((page, index) => {
      const counter = document.createElement('span'); counter.className = 'page-counter'; counter.textContent = (index + 1) + ' / ' + count; page.append(counter);
    });
    window.__reportReady = true;
    parent.postMessage({ type:'exnov-pages', count, height:Math.ceil(pages.getBoundingClientRect().height) }, '*');
  } catch(error) {
    window.__reportError = error.message;
    const message = document.createElement('p'); message.className = 'document-error'; message.textContent = error.message; document.body.append(message);
    parent.postMessage({ type:'exnov-error', message:error.message }, '*');
  }
})();`;
