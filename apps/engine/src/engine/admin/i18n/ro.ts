/**
 * Румынский — язык оригинала панели. Обычные строки здесь не нужны: ключ уже
 * содержит нужный текст, и дублировать его значит завести второе место,
 * где он может разойтись сам с собой.
 *
 * Исключение — коды ошибок сервера. У них ключ это `error.что_случилось`,
 * а не текст, поэтому румынский вариант нужен наравне с остальными.
 */
export const RO: Record<string, string> = {
  "error.odt_broken":
    "Fișierul .odt nu conține content.xml — probabil este deteriorat.",
  "error.document_missing":
    "Documentul nu a fost găsit.",
  "error.file_no_text":
    "Fișierul nu conține text care să poată fi indexat.",
  "error.plan_limit_documents":
    "Ați atins limita planului: {limit} documente.",
  "error.plan_limit_bytes":
    "Ați atins limita planului: {limit} MB în total.",
  "error.plan_limit_chunks":
    "Ați atins limita planului: {limit} fragmente.",
  "error.approved_question_empty":
    "Întrebarea nu poate fi goală.",
  "error.approved_answer_empty":
    "Răspunsul nu poate fi gol.",
  "error.approved_embed_failed":
    "Nu am putut procesa întrebarea, încercați din nou.",
  "error.connector_name_url_required":
    "Sunt necesare numele și adresa de bază.",
  "error.page_url_required":
    "Indicați adresa paginii.",
  "error.drive_not_connected":
    "Google Drive nu este conectat.",
};
