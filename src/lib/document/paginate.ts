/** Ce même code pagine l’iframe d’aperçu et le navigateur Puppeteer. */
export const paginationScript = `
(async function () {
  try {
    // Le contenu source est masqué : fonts.ready seul ne déclenche pas le chargement.
    await Promise.all(['400 12pt InvoiceTable', '700 12pt InvoiceTable', '400 12pt InvoiceSans', '700 12pt InvoiceSans'].map(font => document.fonts.load(font)));
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
    const source = document.getElementById('source');
    const pages = document.getElementById('pages');
    const heading = source.querySelector('.letterhead');
    const footer = source.querySelector('.invoice-footer');
    const watermark = source.querySelector('.watermark');
    const meta = source.querySelector('.invoice-meta');
    const sourceTable = source.querySelector('.invoice-table');
    let content, table, page;
    function newPage(first) {
      page = document.createElement('section'); page.className = 'invoice-page';
      page.append(watermark.cloneNode(true), heading.cloneNode(true), footer.cloneNode(true));
      content = document.createElement('main'); content.className = 'page-content';
      page.append(content); pages.append(page);
      if (first) content.append(meta.cloneNode(true));
      table = sourceTable.cloneNode(false);
      table.append(sourceTable.querySelector('colgroup').cloneNode(true), sourceTable.querySelector('thead').cloneNode(true), document.createElement('tbody'));
      content.append(table);
    }
    function fits() { return content.getBoundingClientRect().bottom <= page.querySelector('.invoice-footer').getBoundingClientRect().top - 8; }
    newPage(true);
    const rows = Array.from(source.querySelectorAll('.service-row')).map(row => row.cloneNode(true));
    while (rows.length) {
      const row = rows.shift();
      table.tBodies[0].append(row);
      if (!fits()) {
        row.remove();
        if (table.tBodies[0].children.length || page === pages.firstElementChild) newPage(false);
        table.tBodies[0].append(row);
        if (!fits()) {
          const cell = row.querySelector('.designation');
          const words = cell.textContent.split(/\\s+/);
          if (words.length < 2) throw new Error('Une ligne est trop longue. Répartissez son texte sur plusieurs prestations.');
          const continuation = row.cloneNode(true);
          let split = Math.ceil(words.length / 2);
          cell.textContent = words.slice(0, split).join(' ');
          while (!fits() && split > 1) { split--; cell.textContent = words.slice(0, split).join(' '); }
          if (!fits()) throw new Error('L’intitulé ou le destinataire est trop long pour une page A4.');
          continuation.querySelectorAll('td').forEach(td => td.textContent = td.classList.contains('designation') ? words.slice(split).join(' ') : '');
          rows.unshift(continuation);
          newPage(false);
        }
      }
    }
    const totals = source.querySelector('.totals').cloneNode(true);
    const closing = source.querySelector('.closing').cloneNode(true);
    table.append(totals); content.append(closing);
    if (!fits()) { totals.remove(); closing.remove(); newPage(false); table.append(totals); content.append(closing); }
    if (!fits()) throw new Error('Le contenu dépasse le format A4. Raccourcissez l’intitulé du projet.');
    const count = pages.children.length;
    Array.from(pages.children).forEach((p,i) => { if(count > 1) { const label = document.createElement('span'); label.className = 'page-counter'; label.textContent = (i+1) + ' / ' + count; p.append(label); } });
    window.__invoiceReady = true;
    // Mesurer les pages, pas le viewport : l’iframe doit aussi pouvoir rétrécir.
    parent.postMessage({ type: 'exnov-pages', count, height: Math.ceil(pages.getBoundingClientRect().height) }, '*');
  } catch (error) {
    window.__invoiceError = error.message;
    const p = document.createElement('p'); p.className='document-error'; p.textContent=error.message; document.body.append(p);
    parent.postMessage({ type:'exnov-error', message:error.message }, '*');
  }
})();
`;
