import Papa from "papaparse";

export async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv")) {
    throw new Error("Only CSV files are supported.");
  }
  return parseCSV(file);
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error: (err) => reject(err),
    });
  });
}
