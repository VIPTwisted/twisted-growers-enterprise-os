import { useState, useEffect } from 'react'
import { hq } from '../lib/hq'

/* ── CROSS-APP MENU: every CEO PLATFORM module, reachable from HR ─────────────
   PLATFORM LAW: navigation comes from the governed nav_registry (one schema for
   all modules), read here from the CEO brain via the hq client. The static
   GROUPS below is only the offline fallback — menu changes happen in the
   registry, not here. Rendered in HR's own dark theme (D365-style launcher). */

const CEO = 'https://vip-ceo-platform.netlify.app'

// Curated 1:1 mirror of the CEO platform's real top-level modules (page → label).
const GROUPS = [
  ['Finance & Accounting', [['Accounting Enterprise','vip_accounting_enterprise'],['General Ledger','gl_general_ledger'],['Accounts Payable','ap_accounts_payable'],['Accounts Receivable','ar_accounts_receivable'],['Cash & Bank','cash_bank_management'],['Cash Management','cash_management'],['Card Settlement','credit_card_settlement'],['Budgeting','budgeting'],['Fixed Assets','fixed_assets_register'],['Financial Dimensions','financial_dimensions'],['Tax Management','tax_management'],['Period Close','period_close'],['Chargeback Tracker','chargeback_tracker'],['Retail Statements','retail_statements'],['QuickBooks','qb_connections']]],
  ['Sales & Commerce', [['Sales Dashboard','sales_department_dashboard'],['Sales Pipeline','sales_pipeline'],['CRM Pipeline','vip_crm_pipeline'],['Customer 360','customer_360'],['E-Commerce','vip_ecommerce_enterprise'],['Storefront','storefront'],['Live Commerce','vip_live_commerce'],['Marketplace OS','marketplace_os'],['Channels & Growth','channels_growth'],['Gift & Loyalty','gift_loyalty'],['Loyalty Rewards','vip_loyalty_rewards']]],
  ['POS & Registers', [['POS Enterprise','vip_pos_enterprise'],['POS Dashboard','pos_ceo_dashboard'],['Register Launcher','ceo_register_launcher'],['Z-Report (Consolidated)','vip_pos_z_report_consolidated_v5'],['AI Z-Report','ai_z_report'],['Hot Items','vip_pos_hot_items'],['Transaction Lookup','transaction_lookup'],['Loss Prevention','loss_prevention']]],
  ['Inventory & Supply Chain', [['Inventory OS','vip_inventory_os'],['Inventory Management','inventory_management'],['Inventory Console','inventory_console'],['Inventory Visibility','inventory_visibility'],['Supply Chain','vip_supply_chain'],['Procurement','procurement'],['Replenishment','replenishment'],['Warehouse','warehouse_management'],['Merchandising OS','vip_merchandising_os'],['Product Info','product_information'],['Product Management','vip_product_mgmt'],['Unified Pricing','unified_pricing'],['Markdown Engine','markdown_engine']]],
  ['Operations', [['Operations HQ','vip_operations_hq'],['Operations','operations'],['Project Operations','project_operations'],['Production Control','production_control'],['Field Service','field_service'],['Coverage Tracker','coverage_tracker'],['Punch List','punch_list']]],
  ['CRM & Service', [['CRM Dashboard','crm_department_dashboard'],['Customer Service Hub','customer_service_hub'],['Customer Support','vip_customer_support']]],
  ['Marketing', [['Marketing Dashboard','marketing_department_dashboard'],['Marketing Automation','vip_marketing_automation'],['Automation Studio','automation_studio'],['White-Label Studio','white_label_studio']]],
  ['HR & Workforce', [['HR Control Tower','hr_control_tower'],['HR Dashboard','hr_department_dashboard'],['Payroll & Benefits','vip_payroll_benefits'],['Recruiting','vip_recruiting'],['Time Clock','vip_timeclock'],['Training & Dev','vip_training_dev'],['HR Scheduling','hr_scheduling']]],
  ['MLM & AI Workforce', [['MLM Network','vip_mlm_network'],['Distributor Portal','distributor_portal'],['AI Agent Center','ai_agent_center'],['AI Workforce','ai_workforce'],['Agent Management','agent_management'],['AI Ops Center','ai_ops_center'],['Agent Action Queue','agent_action_queue']]],
  ['Reports & Analytics', [['Report Center','report_center'],['Reports Center','reports_center'],['Report Builder','vip_report_builder'],['Analytics Dashboard','ceo_analytics_dashboard'],['Store Performance','store_performance'],['System Performance','vip_system_performance']]],
  ['Admin & Governance', [['Company Settings','vip_company_admin_settings'],['Permissions','vip_permissions_management'],['HQ Settings','hq_settings'],['Compliance & Legal','vip_compliance_legal'],['Document Vault','vip_document_vault'],['Change Audit','change_audit'],['Workflow Approvals','workflow_approvals'],['Approvals Inbox','approvals_inbox'],['Entity Manager','vip_entity_manager'],['Import Center','import_center'],['Form Builder','vip_form_builder']]],
]

// Normalize the offline fallback to [title, [[label, href]]].
const FALLBACK = GROUPS.map(([title, items]) => [title, items.map(([lbl, page]) => [lbl, `${CEO}/${page}.html`])])

export default function CeoPlatformMenu() {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const [groups, setGroups] = useState(FALLBACK)
  const [fromRegistry, setFromRegistry] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await hq.rpc('nav_registry_get', { p_module: 'ceo', p_role: 'CEO' })
        if (!alive || error || !Array.isArray(data) || !data.length) return
        const by = {}
        data.forEach(r => { (by[r.group_label] = by[r.group_label] || []).push([r.label, (r.app_url || CEO) + r.route]) })
        setGroups(Object.keys(by).map(g => [g, by[g]]))
        setFromRegistry(true)
      } catch (e) { /* keep fallback */ }
    })()
    return () => { alive = false }
  }, [])

  const total = groups.reduce((a, g) => a + g[1].length, 0)
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', margin: '0 0 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 24px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--t-accent)', textTransform: 'uppercase' }}>CEO Platform — All Modules</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)' }}>{total} modules{fromRegistry ? ' · registry' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter modules…"
            style={{ padding: '4px 10px', fontSize: 12, background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid var(--t-line)' }} />
          <a href={CEO} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textDecoration: 'none', border: '1px solid var(--t-line)', padding: '4px 10px' }}>Open CEO Dashboard →</a>
        </div>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10, alignItems: 'start' }}>
        {groups.map(([title, items]) => {
          const shown = items.filter(([lbl]) => !ql || lbl.toLowerCase().includes(ql))
          if (!shown.length) return null
          return (
            <div key={title} style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)' }}>
              <div style={{ padding: '7px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: 'var(--t-accent)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)' }}>{title}</div>
              {shown.map(([lbl, href]) => (
                <a key={lbl + href} href={href} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', padding: '5px 8px', fontSize: 13, color: 'var(--t-text)', textDecoration: 'none', borderBottom: '1px solid var(--t-line)' }}>{lbl} →</a>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
