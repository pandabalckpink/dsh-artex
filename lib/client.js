window.__ModuleLoader__.load({
	id: "dsh-artex",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		/** The id shared by the sidebar entry and the main panel it opens. */
		const PANEL_ID = "artex";

		const h = React.createElement;

		/** Read the iframe target the host half publishes at /artex/info. */
		function useArtexInfo() {
			const [info, setInfo] = React.useState(null);
			const [error, setError] = React.useState(null);
			const [nonce, setNonce] = React.useState(0);
			React.useEffect(() => {
				let alive = true;
				setError(null);
				fetch("/artex/info", { cache: "no-store" })
					.then(async (response) => {
						const body = await response.json().catch(() => null);
						if (!alive) return;
						if (body && body.url) setInfo(body);
						else setError("ARTEX 地址不可用");
					})
					.catch((reason) => {
						if (alive) setError(String(reason && reason.message ? reason.message : reason));
					});
				return () => {
					alive = false;
				};
			}, [nonce]);
			return { info, error, reload: () => setNonce((value) => value + 1) };
		}

		function Toolbar({ info, error, reload }) {
			const label = "ARTEX";
			const status = error ? "不可用" : info ? (info.ok ? "已连接" : "未连接") : "连接中";
			const color = error ? "var(--dsw-alias-label-error, #d92d20)" : info && info.ok ? "#12b76a" : "var(--dsw-alias-label-tertiary, #98a2b3)";
			return h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						height: 36,
						flex: "none",
						padding: "0 12px",
						borderBottom: "0.5px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08))",
						font: "500 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif",
						color: "var(--dsw-alias-label-secondary, #475467)",
					},
				},
				h("span", { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #101828)" } }, label),
				h("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
					h("span", { style: { width: 6, height: 6, borderRadius: 999, background: color } }),
					status,
				),
				info && info.url
					? h("a", {
							href: info.url,
							target: "_blank",
							rel: "noreferrer",
							style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary, #667085)", textDecoration: "none" },
						}, "在新窗口打开 ↗")
					: null,
				h("button", {
					type: "button",
					onClick: reload,
					title: "重新加载 ARTEX",
					style: {
						border: "0.5px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))",
						background: "transparent",
						color: "inherit",
						borderRadius: 6,
						padding: "2px 8px",
						cursor: "pointer",
						font: "inherit",
					},
				}, "刷新"),
			);
		}

		/** The full-bleed ARTEX page: a toolbar plus the embedded console. */
		function ArtexPage() {
			const { info, error, reload } = useArtexInfo();
			const frameRef = React.useRef(null);
			const [frameKey, setFrameKey] = React.useState(0);
			const target = info && info.url ? info.url.replace(/\/+$/, "") + "/login" : null;
			return h(
				"div",
				{
					style: {
						position: "relative",
						display: "flex",
						flexDirection: "column",
						width: "100%",
						height: "100%",
						minHeight: 0,
						background: "var(--dsw-alias-bg-base, #fff)",
					},
				},
				h(Toolbar, {
					info,
					error,
					reload: () => {
						reload();
						setFrameKey((value) => value + 1);
					},
				}),
				error
					? h("div", { style: { padding: 24, font: "13px/1.6 system-ui, sans-serif", color: "var(--dsw-alias-label-secondary, #475467)" } },
							"无法读取 ARTEX 地址：", error,
							h("div", { style: { marginTop: 8, color: "var(--dsw-alias-label-tertiary, #667085)" } },
								"检查 ARTEX 是否在 http://127.0.0.1:8787 运行，或把 dsh-artex 的 managed 设为 true。"))
					: target
						? h("iframe", {
								key: frameKey,
								ref: frameRef,
								src: target,
								title: "ARTEX",
								allow: "clipboard-write; clipboard-read",
								style: { flex: 1, width: "100%", minHeight: 0, border: "0", background: "#fff" },
							})
						: h("div", { style: { padding: 24, font: "13px system-ui, sans-serif", color: "var(--dsw-alias-label-tertiary, #667085)" } }, "正在连接 ARTEX…"),
			);
		}

		/** Sidebar glyph: a pentest shield. */
		function ArtexIcon({ size = 16 }) {
			const dimension = typeof size === "number" ? size : 16;
			return h(
				"svg",
				{
					width: dimension,
					height: dimension,
					viewBox: "0 0 16 16",
					fill: "none",
					"aria-hidden": "true",
					style: { flex: "none" },
				},
				h("path", {
					d: "M8 1.5 13 3.3v4.2c0 3.2-2.1 6.1-5 7-2.9-.9-5-3.8-5-7V3.3L8 1.5Z",
					stroke: "currentColor",
					strokeWidth: 1.2,
					strokeLinejoin: "round",
				}),
				h("path", {
					d: "M5.6 8.1 7.3 9.8 10.6 6.4",
					stroke: "currentColor",
					strokeWidth: 1.2,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			);
		}

		/** Only the slot registry is required; the panel tolerates a missing layout. */
		const inject = ["slots"];

		/**
		 * Register the ARTEX main panel and its sidebar entry as one
		 * declaration-aware set, so both follow late slot declaration.
		 * @param {any} ctx - browser plugin context.
		 */
		function apply(ctx) {
			ctx.slots.inject("main", function* () {
				yield ctx.slots.register({ name: "main", key: PANEL_ID }, ArtexPage);
			});
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{ name: "sidebar.panellist", id: PANEL_ID, order: 1, label: "ARTEX" },
					ArtexIcon,
				),
			);
		}

		exports.PANEL_ID = PANEL_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
