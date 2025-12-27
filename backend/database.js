import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'https://jqavdyyapjglsgqxnmjg.supabase.co'
const sql = postgres(connectionString)

export default sql
