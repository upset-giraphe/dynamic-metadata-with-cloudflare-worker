import { config } from '../config.js';

export default {
	async fetch(request, env, ctx) {
		// Extracting configuration values
		const domainSource = config.domainSource;
		const metaDataEndpoint = config.metaDataEndpoint;
		const patterns = config.patterns;

		console.log("Worker started");

		// Parse the request URL
		const url = new URL(request.url);

		// Function to check if the URL matches the dynamic page pattern
		function isDynamicPage(url) {
			// This regular expression matches "/event/" followed by one or more non-slash characters
			// const pattern = /\/event\/[^\/]+/;
			const pattern = new RegExp(patterns.dynamicPage);
			let pathname = url + (url.endsWith('/') ? '' : '/');
			return pattern.test(pathname);
		}

		// Function to check if the URL matches the page data pattern (For the WeWeb app)
		function isPageData(url) {
			// This regular expression matches "/event/" followed by one or more non-slash characters
			// const pattern = /\/public\/data\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json/;
			const pattern = new RegExp(patterns.pageData);
			return pattern.test(url);
		}

		// Handle dynamic page requests
		if (isDynamicPage(url.pathname)) {
			console.log("Dynamic page detected:", url.pathname);

			// Fetch the source page content
			let source = await fetch(`${domainSource}${url.pathname}`);

			// Fetch metadata from the API endpoint
			console.log("test : ", url.searchParams.get('path'))
			let pathname = url.pathname + (url.pathname.endsWith('/') ? '' : '/');
			const metaDataResponse = await fetch(`${metaDataEndpoint}${pathname}meta`);
			const metadata = await metaDataResponse.json();
			console.log("Metadata fetched:", metadata);

			// Create a custom header handler with the fetched metadata
			const customHeaderHandler = new CustomHeaderHandler(metadata);

			// Transform the source HTML with the custom headers
			return new HTMLRewriter()
				.on('*', customHeaderHandler)
				.transform(source);

			// Handle page data requests for the WeWeb app
		} else if (isPageData(url.pathname) && isDynamicPage(url.searchParams.get('path'))) {
			console.log("Page data detected:", url.pathname);

			// Fetch the source data content
			const sourceResponse = await fetch(`${domainSource}${url.pathname}`);
			let sourceData = await sourceResponse.json();

			// Fetch metadata from the API endpoint
			let pathname = url.searchParams.get('path') + (url.searchParams.get('path').endsWith('/') ? '' : '/');
			const metaDataResponse = await fetch(`${metaDataEndpoint}${pathname}meta`);
			const metadata = await metaDataResponse.json();
			console.log("Metadata fetched for page data:", metadata);

			// Ensure nested objects exist in the source data
			sourceData.page = sourceData.page || {};
			sourceData.page.title = sourceData.page.title || {};
			sourceData.page.meta = sourceData.page.meta || {};
			sourceData.page.meta.desc = sourceData.page.meta.desc || {};
			sourceData.page.meta.keywords = sourceData.page.meta.keywords || {};
			sourceData.page.socialTitle = sourceData.page.socialTitle || {};
			sourceData.page.socialDesc = sourceData.page.socialDesc || {};

			// Update source data with the fetched metadata
			if (metadata.title) {
				sourceData.page.title.en = metadata.title;
				sourceData.page.socialTitle.en = metadata.title;
			}
			if (metadata.description) {
				sourceData.page.meta.desc.en = metadata.description;
				sourceData.page.socialDesc.en = metadata.description;
			}
			if (metadata.image) {
				sourceData.page.metaImage = metadata.image;
			}
			if (metadata.keywords) {
				sourceData.page.meta.keywords.en = metadata.keywords;
			}

			// Return the modified JSON object
			return new Response(JSON.stringify(sourceData), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// If the URL does not match any patterns, fetch and return the original content
		console.log("Fetching original content for:", url.pathname);
		const sourceUrl = new URL(`${domainSource}${url.pathname}`);
		const sourceRequest = new Request(sourceUrl, request);
		const sourceResponse = await fetch(sourceRequest);

		return sourceResponse;
	}
};

// CustomHeaderHandler class to modify HTML content based on metadata
class CustomHeaderHandler {
	constructor(metadata) {
		this.metadata = metadata;
	}

	element(element) {
		// Replace the <title> tag content
		if (element.tagName == "title") {
			console.log('Replacing title tag content');
			element.setInnerContent(this.metadata.title);
		}
		// Replace meta tags content
		if (element.tagName == "meta") {
			const name = element.getAttribute("name");
			switch (name) {
				case "title":
					element.setAttribute("content", this.metadata.title);
					break;
				case "description":
					element.setAttribute("content", this.metadata.description);
					break;
				case "image":
					element.setAttribute("content", this.metadata.image);
					break;
				case "keywords":
					element.setAttribute("content", this.metadata.keywords);
					break;
				case "twitter:title":
					element.setAttribute("content", this.metadata.title);
					break;
				case "twitter:description":
					element.setAttribute("content", this.metadata.description);
					break;
			}

			const itemprop = element.getAttribute("itemprop");
			switch (itemprop) {
				case "name":
					element.setAttribute("content", this.metadata.title);
					break;
				case "description":
					element.setAttribute("content", this.metadata.description);
					break;
				case "image":
					element.setAttribute("content", this.metadata.image);
					break;
			}

			const type = element.getAttribute("property");
			switch (type) {
				case "og:title":
					console.log('Replacing og:title');
					element.setAttribute("content", this.metadata.title);
					break;
				case "og:description":
					console.log('Replacing og:description');
					element.setAttribute("content", this.metadata.description);
					break;
				case "og:image":
					console.log('Replacing og:image');
					element.setAttribute("content", this.metadata.image);
					break;
			}
		}
	}
}
