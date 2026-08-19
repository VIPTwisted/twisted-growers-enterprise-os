/* One honest path for every department dashboard query.
 *
 * A date-aware RPC failure must remain a visible failure. Falling back to the
 * all-time materialized view puts an old number underneath the user's selected
 * range and turns availability into a data-integrity defect.
 */
export async function fetchDepartmentDashboard(client, { department, from = "", to = "" }) {
  const result = await client.rpc("f_department_dashboard", {
    p_dept: department,
    p_from: from || null,
    p_to: to || null,
  });

  if (result?.error) return { data: null, error: result.error };
  if (!Array.isArray(result?.data) || result.data.length === 0) {
    return {
      data: null,
      error: { message: "The date-aware dashboard returned no verifiable key figures." },
    };
  }
  return { data: result.data, error: null };
}
