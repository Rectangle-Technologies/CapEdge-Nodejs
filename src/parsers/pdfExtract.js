const pdfParse = require('pdf-parse');

const Y_TOLERANCE = 2;

const extractPDF = async (buffer) => {
  const pages = [];
  let fullText = '';

  const renderPage = (pageData) => {
    return pageData
      .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
      .then((textContent) => {
        const items = textContent.items.map((it) => ({
          str: it.str,
          x: Math.round(it.transform[4]),
          y: Math.round(it.transform[5])
        }));

        const rows = groupItemsByRow(items);
        pages.push({ items, rows });

        return rows.map((r) => r.items.map((i) => i.str).join('|')).join('\n');
      });
  };

  const data = await pdfParse(buffer, { pagerender: renderPage });
  fullText = data.text;

  return { pages, fullText, numPages: data.numpages };
};

const groupItemsByRow = (items) => {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let currentRow = null;

  for (const item of sorted) {
    if (!currentRow || Math.abs(currentRow.y - item.y) > Y_TOLERANCE) {
      if (currentRow) rows.push(currentRow);
      currentRow = { y: item.y, items: [item] };
    } else {
      currentRow.items.push(item);
    }
  }
  if (currentRow) rows.push(currentRow);

  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
};

module.exports = { extractPDF };
