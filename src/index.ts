/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const domainSource = "https://f69a71f6-9fd8-443b-a040-78beb5d404d4.weweb-preview.io";
		const url = new URL(request.url);
		function containsEventWithId(url) {
			// This regular expression matches "/event/" followed by one or more non-slash characters
			const pattern = /\/event\/[^\/]+/;
			return pattern.test(url);
		}
		if (containsEventWithId(url.pathname)) {
			// Get the source page
			const source = await fetch(`${domainSource}${url.pathname}`);
			
			// Get the data from an endpoint
			console.log(url.pathname)
			const metaDataResponse = await fetch(`https://xeo6-2sgh-ehgj.n7.xano.io/api:8wD10mRd${url.pathname}/meta`);
			const metadata = await metaDataResponse.json(); // Assuming the metadata is in JSON format

            // Pass the metadata to the handler
            const customHeaderHandler = new CustomHeaderHandler(metadata);

			return new HTMLRewriter()
				.on('*', customHeaderHandler)
				.transform(source);
		}
		// If the URL does not match the condition, fetch and return the original content
		// Preserve headers when fetching the original content
		
        const sourceUrl = new URL(`${domainSource}${url.pathname}`);
        const sourceRequest = new Request(sourceUrl, request); // Clone the request with the new URL
        const sourceResponse = await fetch(sourceRequest);

        return sourceResponse;
		// console.log(`${domainSource}${url.pathname}`);
        // const originalResponse = await fetch(`${domainSource}${url.pathname}`); // Passing the original request directly to the sourceDomain
        // return originalResponse;
	},
};
class CustomHeaderHandler {
	metadata: any;

    constructor(metadata: any) {
        this.metadata = metadata;
    }

	element(element: Element) {
		// An incoming element, such as `div`
		// console.log(`Incoming element: ${element.tagName}`);
		if (element.tagName == "title") {
			console.log('Replacing title')
			element.setInnerContent(this.metadata.title)
		}
		if (element.tagName == "meta") {
			// Update meta names
			const name = element.getAttribute("name")
			switch (name) {
				case "title":
					element.setAttribute("content", this.metadata.title)
					break
				case "description":
					element.setAttribute("content", this.metadata.description)
					break
				case "keywords":
					element.setAttribute("content", "SSR keywords")
					break
			}
			// Update meta itemprops
			const itemprop = element.getAttribute("itemprop")
			switch (itemprop) {
				case "name":
					element.setAttribute("content", this.metadata.title)
					break
				case "description":
					element.setAttribute("content", this.metadata.description)
					break
			}
			const type = element.getAttribute("property")
			switch (type) {
				case "og:title":
					console.log('Replacing og:title')
					element.setAttribute("content", this.metadata.title)
					break
				case "og:description":
					console.log('Replacing og:description')
					element.setAttribute("content", this.metadata.description)
					break
			}
		}
	}
}

async function handleRequest(req) {
	const res = await fetch(req);

	return new HTMLRewriter().on('div', new ElementHandler()).transform(res);
}