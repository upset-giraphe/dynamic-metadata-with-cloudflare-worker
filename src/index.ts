import { config } from '../config.js';

export default {
  async fetch(request, env, ctx) {
    // Extracting configuration values
    const domainSource = config.domainSource;
    const patterns = config.patterns;

    console.log("Worker started");

    // Parse the request URL
    const url = new URL(request.url);

    // Function to find matching pattern configuration for the current URL
    function getPatternConfig(urlPath: string) {
      for (const patternConfig of patterns) {
        const regex = new RegExp(patternConfig.pattern);
        if (regex.test(urlPath)) {
          return patternConfig;
        }
      }
      return null;
    }

    // Function to check if the URL matches the dynamic page pattern
    function isDynamicPage(urlPath: string): boolean {
      const config = getPatternConfig(urlPath);
      console.log(`URL: ${urlPath} - Dynamic page match: ${config !== null}`);
      return config !== null;
    }

    // Function to check if the URL matches the page data pattern (For the WeWeb app)
    function isPageData(urlPath: string): boolean {
      const pattern = /\/public\/data\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json/;
      return pattern.test(urlPath);
    }

    async function requestMetadata(urlPath: string, metaDataEndpoint: string, env: any) {
      try {
        // Extract product_id from the URL path
        const pathParts = urlPath.split('/');
        const product_id = pathParts[pathParts.length - 1];  // Assuming product_id is the last part of the path

        // Construct the endpoint with the product_id as a query parameter
        const metaDataEndpointWithId = `${metaDataEndpoint}?product_id=${encodeURIComponent(product_id)}`;

        console.log("Requesting metadata from:", metaDataEndpointWithId);

        // Set up headers with the API token
        const headers = new Headers({
          "Authorization": `Bearer ${env.SUPABASE_API_TOKEN}`, // Use the stored token from environment variables
          "Content-Type": "application/json"
        });

        // Fetch metadata from the API endpoint
        const metaDataResponse = await fetch(metaDataEndpointWithId, { headers });

        if (!metaDataResponse.ok) {
          throw new Error(`Failed to fetch metadata: ${metaDataResponse.status} ${metaDataResponse.statusText}`);
        }

        const metadata = await metaDataResponse.json();
        console.log("Metadata fetched successfully:", metadata);
        return metadata;

      } catch (error) {
        console.error("Error fetching metadata:", error);
        return null;
      }
    }

    const patternConfig = getPatternConfig(url.pathname);
    if (patternConfig) {
      console.log("Dynamic page detected:", url.pathname);

      const metadata = await requestMetadata(url.pathname, patternConfig.metaDataEndpoint, env);
      if (!metadata) {
        console.error("No metadata found or error in fetching metadata.");
        return new Response("Error fetching metadata", { status: 500 });
      }

      console.log("Metadata fetched:", metadata);

      // Fetch the source page content
      let source;
      try {
        source = await fetch(`${domainSource}${url.pathname}`);
        if (!source.ok) throw new Error(`Error fetching source content: ${source.status} ${source.statusText}`);
      } catch (fetchError) {
        console.error("Error fetching source page content:", fetchError);
        return new Response("Error fetching source page", { status: 500 });
      }

      const customHeaderHandler = new CustomHeaderHandler(metadata);

      return new HTMLRewriter().on("*", customHeaderHandler).transform(source);

    } else if (isPageData(url.pathname) && isDynamicPage(url.searchParams.get('path'))) {
      console.log("Page data detected:", url.pathname);

      // Fetch the source data content
      let sourceResponse;
      try {
        sourceResponse = await fetch(`${domainSource}${url.pathname}`);
        if (!sourceResponse.ok) throw new Error(`Error fetching source data: ${sourceResponse.status} ${sourceResponse.statusText}`);
      } catch (fetchError) {
        console.error("Error fetching source data content:", fetchError);
        return new Response("Error fetching source data", { status: 500 });
      }

      let sourceData;
      try {
        sourceData = await sourceResponse.json();
      } catch (jsonError) {
        console.error("Error parsing source data JSON:", jsonError);
        return new Response("Error parsing source data JSON", { status: 500 });
      }

      const pathname = url.searchParams.get('path') + (url.searchParams.get('path').endsWith('/') ? '' : '/');
      const metadata = await requestMetadata(pathname, patternConfig.metaDataEndpoint, env);
      if (!metadata) {
        console.error("No metadata found or error in fetching metadata.");
        return new Response("Error fetching metadata", { status: 500 });
      }

      console.log("Metadata fetched:", metadata);

      // Update source data with the fetched metadata
      sourceData.page = sourceData.page || {};
      sourceData.page.title = sourceData.page.title || {};
      sourceData.page.meta = sourceData.page.meta || {};
      sourceData.page.meta.desc = sourceData.page.meta.desc || {};
      sourceData.page.meta.keywords = sourceData.page.meta.keywords || {};
      sourceData.page.socialTitle = sourceData.page.socialTitle || {};
      sourceData.page.socialDesc = sourceData.page.socialDesc || {};

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

      return new Response(JSON.stringify(sourceData), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If the URL does not match any patterns, fetch and return the original content
    console.log("Fetching original content for:", url.pathname);
    try {
      const sourceUrl = new URL(`${domainSource}${url.pathname}`);
      const sourceRequest = new Request(sourceUrl, request);
      const sourceResponse = await fetch(sourceRequest);
      if (!sourceResponse.ok) throw new Error(`Error fetching original content: ${sourceResponse.status} ${sourceResponse.statusText}`);
      return sourceResponse;
    } catch (error) {
      console.error("Error fetching original content:", error);
      return new Response("Error fetching original content", { status: 500 });
    }
  }
};

// CustomHeaderHandler class to modify HTML content based on metadata
class CustomHeaderHandler {
  constructor(metadata) {
    this.metadata = metadata;
  }

  element(element) {
    if (element.tagName === "title") {
      console.log('Replacing title tag content');
      element.setInnerContent(this.metadata.title);
    }
    if (element.tagName === "meta") {
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
        case "og
