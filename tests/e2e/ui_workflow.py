"""Browser end-to-end check of the clinical workflow against a running stack (web :5173, API :4000, gateway :4100).
Run: python3 tests/e2e/ui_workflow.py   (requires Playwright + Chromium and seeded demo data with simulator scenarios loaded)"""
import sys, re
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:5173'; PW = 'DemoPass#2026'; OUT = '/tmp/shots'
results = []
def check(name, fn):
    try: fn(); results.append((name, True, ''))
    except Exception as e: results.append((name, False, str(e).splitlines()[0][:160]))

def login(page, who):
    page.goto(f'{BASE}/login'); page.fill('#email', f'{who}@demo.neocareai.test'); page.fill('#password', PW)
    page.click('button:has-text("Sign in")'); page.wait_for_url(BASE + '/')

with sync_playwright() as p:
    b = p.chromium.launch(); errors = []
    ctx = b.new_context(viewport={'width': 1360, 'height': 900}); page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text and '401' not in m.text else None)

    check('unauthenticated visit redirects to login', lambda: (page.goto(BASE + '/alerts'), page.wait_for_url(re.compile('/login'))))
    check('invalid credentials show an error', lambda: (page.fill('#email', 'doctor@demo.neocareai.test'), page.fill('#password', 'wrong-wrong'), page.click('button:has-text("Sign in")'), expect(page.get_by_role('alert')).to_contain_text('Invalid email or password')))
    login(page, 'doctor')
    check('overview shows summary and live table', lambda: (expect(page.get_by_text('Newborns currently monitored')).to_be_visible(), expect(page.get_by_text('NB-0001').first).to_be_visible()))
    page.wait_for_timeout(1500); page.screenshot(path=f'{OUT}/overview.png', full_page=True)

    page.click('a:has-text("Live Monitoring")'); page.wait_for_timeout(1500)
    check('monitoring labels simulated devices', lambda: expect(page.get_by_text('Simulated device').first).to_be_visible())
    check('disconnected device shown as not current', lambda: expect(page.get_by_text('Disconnected, data not current')).to_be_visible())
    page.screenshot(path=f'{OUT}/monitoring.png', full_page=True)

    page.click('a:has-text("Clinical Alerts")')
    check('alert list shows the illustrative alert awaiting acknowledgement', lambda: expect(page.get_by_text('Awaiting acknowledgement').first).to_be_visible())
    page.click('a:has-text("Review alert")')
    check('opening an alert does not change its status', lambda: (page.wait_for_timeout(1200), expect(page.get_by_text('Awaiting acknowledgement').first).to_be_visible()))
    check('explanation and evidence are displayed', lambda: (expect(page.get_by_text('Why this alert was generated')).to_be_visible(), expect(page.get_by_text('Triggering observations')).to_be_visible(), expect(page.get_by_text('illustrative demonstration rule')).to_be_visible()))
    page.screenshot(path=f'{OUT}/alert_detail.png', full_page=True)

    page.click('button:has-text("Acknowledge alert")'); 
    check('acknowledge updates status', lambda: expect(page.get_by_text('Alert acknowledged')).to_be_visible())
    page.click('button:has-text("Record assessment")')
    check('assessment requires text (submit disabled)', lambda: expect(page.get_by_role('dialog').get_by_role('button', name='Record assessment')).to_be_disabled())
    page.fill('#txt', 'Bedside review completed (synthetic demo).'); page.fill('#resp', 'Sensor repositioned; repeat observations planned.')
    page.get_by_role('dialog').get_by_role('button', name='Record assessment').click()
    check('assessment recorded', lambda: expect(page.get_by_text('Assessment recorded').first).to_be_visible())
    page.click('button:has-text("Resolve")'); page.fill('#txt', 'Reviewed by clinician; closing synthetic demo alert.')
    page.get_by_role('dialog').get_by_role('button', name='Resolve alert').click(); page.wait_for_timeout(1000)
    def lifecycle():
        for t in ['Alert generated', 'Acknowledged', 'Assessment recorded', 'Response documented', 'Resolved']: expect(page.get_by_text(t).first).to_be_visible()
    check('full lifecycle preserved in response history', lifecycle)
    page.screenshot(path=f'{OUT}/alert_resolved.png', full_page=True)

    page.click('a:has-text("Response Log")'); page.wait_for_timeout(800)
    check('response log lists the events', lambda: expect(page.get_by_text('Resolved').first).to_be_visible())

    page.goto(f'{BASE}/newborns'); page.wait_for_timeout(800); page.click('a:has-text("NB-0001")'); page.click('button:has-text("Trends")'); page.wait_for_timeout(1500)
    check('trend charts render', lambda: expect(page.locator('svg.recharts-surface').first).to_be_visible())
    page.screenshot(path=f'{OUT}/profile_trends.png', full_page=True)

    # admin
    ctx2 = b.new_context(viewport={'width': 1360, 'height': 900}); pa = ctx2.new_page(); login(pa, 'admin')
    check('admin has no clinical nav', lambda: expect(pa.locator('nav.nav a:has-text("Clinical Alerts")')).to_have_count(0))
    pa.goto(BASE + '/alerts'); check('admin blocked from alerts page', lambda: expect(pa.get_by_text('You don’t have access to this page')).to_be_visible())
    pa.goto(BASE + '/newborns'); pa.click('button:has-text("Register newborn")'); pa.fill('#nid', 'NB-0777'); pa.get_by_role('dialog').get_by_role('button', name='Register newborn').click(); pa.wait_for_timeout(1000)
    check('admin registers a newborn', lambda: expect(pa.get_by_text('NB-0777')).to_be_visible())
    pa.click('button:has-text("Register newborn")'); pa.fill('#nid', 'NB-0777'); pa.get_by_role('dialog').get_by_role('button', name='Register newborn').click()
    check('duplicate identifier shows a clear error', lambda: expect(pa.get_by_role('alert')).to_contain_text('already exists'))
    # mobile
    ctx3 = b.new_context(viewport={'width': 390, 'height': 800}); pm = ctx3.new_page(); login(pm, 'nurse'); pm.goto(BASE + '/monitoring'); pm.wait_for_timeout(1500)
    check('mobile navigation visible and no horizontal scroll', lambda: (expect(pm.locator('nav.mobile-nav')).to_be_visible(), None if pm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1') else (_ for _ in ()).throw(AssertionError('horizontal overflow'))))
    pm.screenshot(path=f'{OUT}/mobile_monitoring.png', full_page=True)
    check('no console or page errors', lambda: None if not errors else (_ for _ in ()).throw(AssertionError(errors[0][:150])))
    b.close()

ok = sum(1 for r in results if r[1])
for n, s, m in results: print(('PASS ' if s else 'FAIL ') + n + (f'  -> {m}' if m else ''))
print(f'{ok}/{len(results)} passed'); sys.exit(0 if ok == len(results) else 1)
