[Русский](README.md) | **English**

# Direct

A Chrome extension for routing traffic together with V2RayTun. It optimizes connections: chosen hosts go direct and skip the proxy.

A green arrow means the tab uses a direct connection. A gray arrow means the traffic goes through the proxy. The language switch is at the top right, EN / RU.

## Use

- Click the icon and add the open site to the direct list. Its subdomains and the hosts that page loads go direct too, so those requests do not use the proxy.
- If a site does not start loading because of the proxy settings, paste the link and press Direct. You do not have to wait for the error page.
- Right-click a link, then Open direct.
- Turn the extension off to return Chrome to the system proxy settings.

## Install

V2RayTun must already be on, in proxy mode.

1. Double-click `install.bat`. It builds the program that reads the V2RayTun port and allows Chrome to start it. Run `install.bat` again if the project folder moves.
2. Chrome opens the extensions page. Turn on Developer mode and click Load unpacked. Select the `extension` folder.
3. Allow site access if Chrome asks. After file updates, click Reload on Direct.
