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
      ['.watermark','.letterhead','.invoice-footer','.report-running-reference'].forEach(selector => {
        const element = source.querySelector(selector);
        if (element) page.append(element.cloneNode(true));
      });
      content = document.createElement('main'); content.className = 'page-content report-content';
      page.append(content); pages.append(page);
    }
    function fits() {
      // Réserver l’espace de référence et du compteur au-dessus du pied partagé.
      const footerTop = page.querySelector('.invoice-footer').getBoundingClientRect().top;
      const referenceTop = page.querySelector('.report-running-reference')?.getBoundingClientRect().top || footerTop;
      return content.getBoundingClientRect().bottom <= Math.min(footerTop - 42, referenceTop - 8);
    }
    function textNode(block) { return block.querySelector('[data-split-text]') || block; }
    function textMetrics(node) {
      const style = getComputedStyle(node);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
      const inset = ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
      return { line, height: node.getBoundingClientRect().height - inset };
    }
    function hasEarlierContent(block) {
      return Array.from(content.children).some(child => child !== block && !child.matches('[data-keep-next]'));
    }
    function splitPoint(block) {
      const node = textNode(block), original = node.textContent;
      const full = textMetrics(node);
      let low = 0, high = original.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2); node.textContent = original.slice(0, mid);
        if (fits()) low = mid; else high = mid - 1;
      }
      let split = low;
      // Le reste doit occuper au moins deux lignes, si le texte est assez long.
      // Le bloc témoin conserve exactement la largeur et les styles du texte.
      if (split && full.height >= full.line * 4 - 1) {
        const probe = block.cloneNode(true), remainder = textNode(probe);
        content.append(probe); remainder.textContent = original.slice(split);
        if (textMetrics(remainder).height < full.line * 2 - 1) {
          let start = 0, end = split;
          while (start < end) {
            const mid = Math.ceil((start + end) / 2); remainder.textContent = original.slice(mid);
            if (textMetrics(remainder).height >= full.line * 2 - 1) start = mid; else end = mid - 1;
          }
          split = start;
        }
        probe.remove();
      }
      const space = original.lastIndexOf(' ', split - 1);
      if (space > split / 2) split = space + 1;
      node.textContent = original.slice(0, split);
      const enoughStart = textMetrics(node).height >= full.line * 2 - 1;
      node.textContent = original;
      return { original, split, enoughStart };
    }
    function followingPage() {
      const headings = [];
      while (content.lastElementChild?.matches('[data-keep-next]')) headings.unshift(content.lastElementChild), content.lastElementChild.remove();
      if (content.children.length) newPage();
      for (const heading of headings) content.append(heading);
    }
    function tablePages(block) {
      const rows = Array.from(block.querySelector('tbody').children);
      const template = block.cloneNode(true);
      template.querySelector('tbody').replaceChildren();
      let table = null, consumed = 0;
      for (const row of rows) {
        if (!table) {
          table = template.cloneNode(true); content.append(table);
        }
        table.querySelector('tbody').append(row);
        if (fits()) { consumed += 1; continue; }
        row.remove();
        if (!table.querySelector('tbody').children.length) table.remove();
        if (!content.children.length) throw new Error('Une ligne de tableau est trop longue pour une page A4.');
        followingPage();
        table = template.cloneNode(true);
        if (consumed && block.matches('.report-actions-table')) {
          const caption = document.createElement('caption'); caption.className = 'report-table-continuation'; caption.textContent = 'Plan d’actions et suivi — suite'; table.prepend(caption);
        }
        content.append(table); table.querySelector('tbody').append(row);
        if (!fits()) throw new Error('Une ligne de tableau est trop longue pour une page A4.');
        consumed += 1;
      }
    }
    function keepWithFollowing(block, blocks) {
      if (!block.matches('[data-keep-next]') || !blocks.length) return;
      const probes = [];
      for (const next of blocks) {
        const probe = next.cloneNode(true);
        if (probe.matches('[data-split]')) textNode(probe).textContent = textNode(probe).textContent.slice(0, 180);
        if (probe.matches('[data-paginated-table]')) {
          const rows = Array.from(probe.querySelector('tbody').children);
          for (const row of rows.slice(1)) row.remove();
        }
        probes.push(probe); content.append(probe);
        if (!probe.matches('[data-keep-next]')) break;
      }
      const together = fits();
      for (const probe of probes) probe.remove();
      if (!together) followingPage();
    }
    newPage();
    const blocks = Array.from(source.querySelector('.report-blocks').children).map(block => block.cloneNode(true));
    while (blocks.length) {
      const block = blocks.shift();
      if (block.matches('[data-paginated-table]')) { tablePages(block); continue; }
      content.append(block);
      if (block.matches('.report-cover')) {
        if (!fits()) block.classList.add('report-cover-compact');
        if (!fits()) block.style.zoom = '0.9';
        if (!fits()) throw new Error('Les informations de la page de garde sont trop longues.');
        if (blocks.length) newPage();
        continue;
      }
      if (fits()) { keepWithFollowing(block, blocks); continue; }
      block.remove();
      // Paragraphes et champs de constat se répartissent sans perdre leurs labels.
      if (block.matches('[data-split]')) {
        content.append(block);
        const node = textNode(block), metrics = textMetrics(node);
        // Un paragraphe court reste entier quand il peut passer à la page suivante.
        if (metrics.height <= metrics.line * 6 + 1 && hasEarlierContent(block)) {
          block.remove(); followingPage(); content.append(block);
          if (fits()) continue;
        }
        const { original, split, enoughStart } = splitPoint(block);
        if (split > 0 && (enoughStart || !hasEarlierContent(block))) {
          node.textContent = original.slice(0, split);
          const rest = block.cloneNode(true); textNode(rest).textContent = original.slice(split); rest.classList.add('is-continuation');
          blocks.unshift(rest); newPage(); continue;
        }
        block.remove();
      }
      if (!content.children.length) throw new Error('Un bloc est trop grand pour une page A4. Raccourcissez son contenu.');
      followingPage(); content.append(block);
      if (!fits()) {
        block.remove();
        if (block.matches('[data-split]')) {
          // Un bloc plus long qu’une page doit toujours avancer, même après un
          // titre très haut ou avec de nombreux retours à la ligne.
          content.append(block);
          const node = textNode(block), { original, split } = splitPoint(block);
          if (!split) throw new Error('Un titre est trop long pour une page A4.');
          node.textContent = original.slice(0, split);
          const rest = block.cloneNode(true); textNode(rest).textContent = original.slice(split); rest.classList.add('is-continuation');
          blocks.unshift(rest); newPage(); continue;
        }
        throw new Error('Un titre, une photographie ou une légende est trop long pour une page A4.');
      }
      keepWithFollowing(block, blocks);
    }
    const count = pages.children.length;
    const locations = new Map();
    Array.from(pages.children).forEach((page, index) => {
      page.querySelectorAll('[data-section-id]').forEach(heading => {
        heading.id = heading.dataset.sectionId; locations.set(heading.dataset.sectionId, index + 1);
      });
      const counter = document.createElement('span'); counter.className = 'page-counter'; counter.textContent = 'Page ' + (index + 1) + ' / ' + count; page.append(counter);
    });
    pages.querySelectorAll('[data-toc-target]').forEach(row => row.querySelector('.report-toc-page').textContent = String(locations.get(row.dataset.tocTarget) || '—'));
    window.__reportReady = true;
    parent.postMessage({ type:'exnov-pages', count, height:Math.ceil(pages.getBoundingClientRect().height) }, '*');
  } catch(error) {
    window.__reportError = error.message;
    const message = document.createElement('p'); message.className = 'document-error'; message.textContent = error.message; document.body.append(message);
    parent.postMessage({ type:'exnov-error', message:error.message }, '*');
  }
})();`;
