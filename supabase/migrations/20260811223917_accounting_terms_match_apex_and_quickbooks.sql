-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-022 (reviewers V, X, W).
-- OWNER RULING 11 Aug 2026, extending the vocabulary doctrine: "accounting terms match Apex and
-- QuickBooks."
--
-- THE COMPLETE PRECEDENCE, now with two lanes:
--   COMPLIANCE AND MATERIAL: Metrc, then manifest, then COA. (Prior ruling, unchanged.)
--   ACCOUNTING AND MONEY:    Apex and QuickBooks.
--     Within the accounting lane: QUICKBOOKS for accounting artefacts - invoice, bill, credit
--     memo, journal entry, account, customer, vendor - because QuickBooks is where the books
--     will actually be kept and the CPA will live in its vocabulary. APEX for trade-pipeline
--     objects QuickBooks has no word for - shipping order, receiving order, deal, buyer lead.
--
-- ONE KNOWN COLLISION, RECORDED RATHER THAN GUESSED: Apex says BUYER where QuickBooks says
-- CUSTOMER for the same counterparty. Split by context: "customer" on anything accounting-facing
-- (invoices, receivables, statements), "buyer" only inside Apex-pipeline surfaces. That is a
-- proposal pending the owner, not settled - marked accordingly.
--
-- UNDO: delete from glossary_term where domain = 'accounting';
--       restore the prior db_policy rule text from migration vocabulary_follows_the_system_of_record.

update db_policy set
  rule = 'Vocabulary follows the system of record, in two lanes. COMPLIANCE AND MATERIAL terms: use the word Metrc uses; if Metrc has no term, the manifest; then the COA. ACCOUNTING AND MONEY terms: match Apex and QuickBooks - QuickBooks for accounting artefacts (invoice, bill, journal entry, customer, vendor), Apex for trade-pipeline objects QuickBooks lacks (shipping order, receiving order, buyer lead). Never introduce a new spelling of a word an authority already uses. Concepts none of them name are settled in glossary_term by the owner.',
  because = because || ' Extended same day by the owner: accounting terms match Apex and QuickBooks - QuickBooks because the books are kept there and the signing CPA lives in its vocabulary.'
where rule like 'Vocabulary follows the system of record%';

insert into glossary_term (term, preferred_form, definition, domain, why_it_matters, settled, settled_by) values
('invoice', 'invoice',
 'The document requesting payment from a customer for goods delivered. In QuickBooks an INVOICE is money owed TO us; a BILL is money we owe a vendor. The two are not interchangeable.',
 'accounting',
 'Confusing invoice with bill flips the direction of money. QuickBooks enforces the distinction; the platform must speak it before the books move there.',
 true, 'Owner (Vinny), 11 Aug 2026 — accounting terms match Apex and QuickBooks'),
('bill', 'bill',
 'A vendor''s request for payment - money WE owe. QuickBooks vocabulary; the mirror of an invoice.',
 'accounting',
 'Third-party purchase substantiation (IRC 6001) will be evidenced by bills, not invoices. Naming them correctly now saves reclassifying every document at year-end.',
 true, 'Owner (Vinny), 11 Aug 2026 — accounting terms match Apex and QuickBooks'),
('customer', 'customer',
 'The counterparty who buys from us, on any accounting-facing surface: invoices, receivables, statements, aging.',
 'accounting',
 'COLLISION RECORDED: Apex calls the same party a BUYER. Proposal: customer on accounting surfaces, buyer only inside Apex-pipeline pages. PENDING the owner''s confirmation - the two words are one counterparty and must reconcile one-to-one.',
 false, null),
('cost of goods sold', 'COGS',
 'The inventoriable cost of product sold, computed under IRC 471. The only deduction lane that survives 280E.',
 'accounting',
 'QuickBooks account type name. Every cost the platform classifies eventually lands in or out of this account, and the tax outcome turns on which.',
 true, 'Owner (Vinny), 11 Aug 2026 — accounting terms match Apex and QuickBooks'),
('receiving order', 'receiving order',
 'Apex''s object for an inbound purchase into the marketplace. Currently evidenced empty for our account - purchases were never transacted through Apex.',
 'accounting',
 'Apex vocabulary, kept exactly as their API names it (receiving-orders) so the day rows appear nobody wonders what they are.',
 true, 'Owner (Vinny), 11 Aug 2026 — accounting terms match Apex and QuickBooks'),
('shipping order', 'shipping order',
 'Apex''s object for an outbound sale. 1,758 exist for our account and they are the sales pipeline''s source of record.',
 'accounting',
 'Apex vocabulary, kept exactly as their API names it (shipping-orders).',
 true, 'Owner (Vinny), 11 Aug 2026 — accounting terms match Apex and QuickBooks')
on conflict (term) do nothing;

insert into glossary_variant (variant, term, variant_kind, uses_found, seen_in, why) values
 ('buyer', 'customer', 'accepted', null, 'Apex pipeline surfaces and apex_* tables',
  'Apex''s word for the same counterparty. Accepted ONLY inside Apex-pipeline context; accounting surfaces say customer. The two must reconcile one-to-one.'),
 ('cogs', 'cost of goods sold', 'accepted', null, 'cost_classes.cogs column, doctrine',
  'Lower-case identifier form, correct in code; COGS in any label.'),
 ('vendor bill', 'bill', 'accepted', null, 'QuickBooks language', 'QuickBooks'' longer form of the same artefact.')
on conflict (variant) do nothing;;
