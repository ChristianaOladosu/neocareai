"""Browser end-to-end check of AI assistance (Demo Mode). Requires the stack running with simulator scenario B loaded on SIM-MON-01.
Run: python3 tests/e2e/ai_workflow.py"""
import sys, re
from playwright.sync_api import sync_playwright, expect
BASE = 'http://127.0.0.1:5173'; PW = 'DemoPass#2026'; OUT = '/tmp/shots'; results = []
def check(name, fn):
    try: fn(); results.append((name, True, ''))
    except Exception as e: results.append((name, False, str(e).splitlines()[0][:170]))
def login(page, who):
    page.goto(f'{BASE}/login'); page.fill('#email', f'{who}@demo.neocareai.test'); page.fill('#password', PW); page.click('button:has-text("Sign in")'); page.wait_for_url(BASE + '/')
def open_alert(page):
    page.goto(f'{BASE}/alerts'); page.locator('.alert-row', has_text='NB-0001').first.get_by_role('link', name=re.compile('Review alert|Open')).click(); page.wait_for_selector('text=Why this alert was generated')
LABEL = 'Demo Mode – Not Connected to Azure'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1360, 'height': 1000}); page = ctx.new_page()
    login(page, 'doctor'); open_alert(page)
    check('AI panel shows the Demo Mode label before use', lambda: expect(page.locator('#ai-h').locator('xpath=ancestor::section').get_by_text(LABEL).first).to_be_visible())
    check('panel states what AI will not do', lambda: expect(page.get_by_text('does not diagnose', exact=False)).to_be_visible())
    page.get_by_role('button', name='Summarise this alert').click()
    check('summary appears with detected rule and measurements', lambda: (expect(page.get_by_text('What the system detected')).to_be_visible(), expect(page.get_by_text('Measurements involved')).to_be_visible()))
    check('summary does not change the alert status', lambda: expect(page.get_by_text('Awaiting acknowledgement').first).to_be_visible())
    check('sources and limitations are available', lambda: (page.get_by_text('Sources and limitations').click(), expect(page.get_by_text('DOC-QUALITY-001')).to_be_visible(), expect(page.get_by_text('not a diagnosis', exact=False).first).to_be_visible()))
    page.screenshot(path=f'{OUT}/ai_summary.png', full_page=True)
    page.get_by_role('button', name='Prepare draft assessment').click()
    check('draft shows clinician-only placeholders', lambda: expect(page.locator('pre')).to_contain_text('[Clinician to complete'))
    check('draft cannot be edited into the form before acknowledgement', lambda: expect(page.get_by_role('button', name='Edit draft in assessment form')).to_be_disabled())
    page.get_by_role('button', name='Acknowledge alert').click(); page.wait_for_timeout(900)
    page.get_by_role('button', name='Prepare draft assessment').click(); page.wait_for_selector('pre')
    page.get_by_role('button', name='Edit draft in assessment form').click()
    dlg = page.get_by_role('dialog')
    check('assessment form is prefilled and flagged as an AI draft', lambda: (expect(dlg.get_by_text('Started from an AI-prepared draft')).to_be_visible(), expect(dlg.locator('textarea').first).to_contain_text('DRAFT FOR CLINICIAN REVIEW')))
    check('recording is blocked while placeholders remain', lambda: expect(dlg.get_by_role('button', name='Record assessment')).to_be_disabled())
    page.screenshot(path=f'{OUT}/ai_draft_dialog.png')
    ta = dlg.locator('textarea').first; val = ta.input_value()
    ta.fill(re.sub(r'\[Clinician to complete[^\]]*\]', 'Completed by the clinician (synthetic demo).', val))
    check('recording unlocks once every field is completed', lambda: expect(dlg.get_by_role('button', name='Record assessment')).to_be_enabled())
    dlg.get_by_role('button', name='Record assessment').click(); page.wait_for_timeout(1200)
    check('history marks the assessment as started from an AI draft', lambda: expect(page.get_by_text('Started from an AI-prepared draft (Demo Mode). Written, edited and recorded by the clinician.')).to_be_visible())
    check('alert is still open (AI did not resolve it)', lambda: expect(page.get_by_text('Under assessment').first).to_be_visible())
    page.screenshot(path=f'{OUT}/ai_after.png', full_page=True)

    nctx = b.new_context(viewport={'width': 1360, 'height': 900}); npg = nctx.new_page(); login(npg, 'nurse'); open_alert(npg)
    check('nurse can summarise but has no draft button', lambda: (expect(npg.get_by_role('button', name='Summarise this alert')).to_be_visible(), expect(npg.get_by_role('button', name='Prepare draft assessment')).to_have_count(0)))
    actx = b.new_context(viewport={'width': 1360, 'height': 900}); apg = actx.new_page(); login(apg, 'admin'); apg.goto(f'{BASE}/settings'); apg.get_by_role('tab', name='AI assistance').click(); apg.wait_for_timeout(900)
    check('administrator sees AI oversight with mode, limits and activity', lambda: (expect(apg.get_by_text(LABEL).first).to_be_visible(), expect(apg.get_by_text('What it can never do')).to_be_visible(), expect(apg.get_by_text('Draft assessment').first).to_be_visible()))
    check('AI activity lists tools used', lambda: expect(apg.get_by_text('get_alert', exact=False).first).to_be_visible())
    apg.screenshot(path=f'{OUT}/ai_admin.png', full_page=True)
    b.close()
ok = sum(r[1] for r in results)
for n, s, m in results: print(('PASS ' if s else 'FAIL ') + n + (f'  -> {m}' if m else ''))
print(f'{ok}/{len(results)} passed'); sys.exit(0 if ok == len(results) else 1)
