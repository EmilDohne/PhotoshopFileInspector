var IS_PSB = true;
// A list of keys that have a length marker of 8 bytes in PSB mode
var EIGHT_BYTE_KEYS = ["LMsk", "Lr16", "Lr32", "Layr", "Mt16", "Mt32", "Mtrn", "Alph", "FMsk", "lnk2", "FEid", "FXid", "PxSD", "cinf"]

// A mapping of Image Resource IDs to Their names for display purposes
var IMAGE_RESOURCE_ID_NAMES = {
	1005 : "ResolutionInfo Structure",
	1006 : "Names of the Alpha Channels",
	1010 : "Background Color",
	1011 : "Print Flags",
	1013 : "Color Halftoning Information",
	1016 : "Color transfer functions",
	1024 : "Layer State Information",
	1026 : "Layers Group Information",
	1028 : "IPTC Record",
	1032 : "Grid and Guides Information",
	1036 : "Thumbnail Resource",
	1037 : "Global Angle, 4 bytes between 0 and 359 which is the lighting angle for effects layers",
	1041 : "ICC Untagged Profile",
	1043 : "Spot Halftone",
	1044 : "Document-specific IDs Seed Number",
	1045 : "Unicode Alpha Names",
	1049 : "Global Altitude",
	1050 : "Slices",
	1053 : "Alpha Identifiers",
	1054 : "URL List",
	1057 : "Version Info",
	1058 : "Exif data 1",
	1060 : "XMP Metadata",
	1061 : "Caption Digest (16 bytes : RSA Data Security, MD5 message-digest algorithm)",
	1062 : "Print Scale",
	1064 : "Pixel Aspect Ratio",
	1067 : "Alternate Spot Colors",
	1069 : "Layers Selection ID(s)",
	1072 : "Layers Group Enabled ID",
	1077 : "Display Info Structure",
	1082 : "Print Information",
	1083 : "Print Style",
	10000: "Print flags Information"

}


registerFileType((fileExt, filePath, fileData) => {
	// Check for the right file extension
	if (fileExt == 'psb' ) {
		return true;
	} else if (fileExt == 'psd'){
		return true;
	}
	return false;
});

// Create a memdump of a certain value maximum value that the memdump cannot exceed
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function memdumpMaxAmount(length, max_length)
{
	if (length > max_length)
	{
		read(max_length)
		addMemDump();
		// Read the rest of the data to move the pointer forward
		setOffset(readOffset() + length - max_length)
	} else 
	{
		read(length);
		addMemDump();
	}
}

// Create a memdump of a certain value maximum value that the memdump cannot exceed as a detail with an annotation
// Requires an offset to be passed
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function memdumpMaxAmountDetail(length, max_length, annotation, offset)
{
	read(length);
	addRow(annotation, 0, "Displaying a maximum of " + max_length + " values at a time");
	addDetails(() => {
		setOffset(offset);
		memdumpMaxAmount(length, max_length);
	})
}

// Read a variadic amount of bytes based on whether or not the file is a Psd or Psb document
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readPsdPsb(PsdCount, PsbCount)
{
	if(IS_PSB == false){
		read(PsdCount);
	} else if (IS_PSB == true) {
		read(PsbCount);
	}
}

// Return a variadic amount of bytes based on whether or not the file is a Psd or Psb document.
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function swapPsdPsb(PsdCount, PsbCount)
{
	if(IS_PSB == false){
		return PsdCount
	} else if (IS_PSB == true) {
		return PsbCount
	}
}


// Get the current offset by first updating the lastRead marker
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readOffset()
{
	read(0);
	return getOffset();
}

// Format a large number into a string with commas deliminating each 1000 step
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function roundUpToMultiple(value, count)
{
	// Check if padding is even required, then pad
	if (value % count != 0)
	{
		return value + count - (value % count)
	} else
	{
		return value
	}
}

// The parser to decode the file
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
registerParser(() => {
	addStandardHeader();
	setEndianness('big')

	// File Header Section
	read(4);
	const Signature = getStringValue()
	read(2);
    const Version = getNumberValue();
    if (Version == 1){ IS_PSB = false; }
	read(6);
	const Reserved = getNumberValue()
	read(2);
	const ChannelCount = getNumberValue();
	read(4);
	const Height = getNumberValue();
	read(4);
	const Width = getNumberValue();
	read(2);
	const Depth = getNumberValue();
	read(2);
	const colorMode = getNumberValue();
	read(0);
	
	setOffset(0);
	read(26);
	addRow("File Header");
	addDetails(() => {
		addRow("Signature", Signature, "always equal to '8BPS' . Do not try to read the file if the signature does not match this value.");
		addRow("Version", Version, "always equal to 1. Do not try to read the file if the version does not match this value. (**PSB** version is 2.)");
		addRow("Reserved", Reserved, "must be zero.");
		addRow("Channels", ChannelCount, "The number of channels in the image, including any alpha channels. Supported range is 1 to 56.");
		addRow("Height", Height, "The height of the image in pixels. Supported range is 1 to 30,000.(*PSB** max of 300,000)");
		addRow("Width", Width, "The width of the image in pixels. Supported range is 1 to 30,000.(*PSB** max of 300,000)");
		addRow("Depth", Depth, "the number of bits per channel. Supported values are 1, 8, 16 and 32.");
		addRow("ColorMode", colorMode, "The color mode of the file. Supported values are: Bitmap = 0; Grayscale = 1; Indexed = 2; RGB = 3; CMYK = 4; Multichannel = 7; Duotone = 8; Lab = 9");
	});

	// Color Mode Section
	let image_resource_offset = readColorModeSection(colorMode, 26, Depth);

	// Image Resources Section
	let layer_mask_offset = readImageResources(image_resource_offset);

	// Global Layer and Mask Information Section
	let image_data_offset = readLayerMaskInfo(layer_mask_offset);

	// Image Data
	readImageData(image_data_offset, ChannelCount, Height, Width, Depth);
});


// Read the Color Mode Section, only relevant for indexed colors, otherwise empty
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readColorModeSection(colorMode, sectionOffset, depth)
{
	setOffset(sectionOffset);

	/*	Indexed color = 768 bytes
		Duotone = unknown
		Else = 4 bytes */
		if (colorMode == 2) {
			read(768);
			addRow('Indexed Color');
			addDetails(() => {
				read(768);
				addMemDump();
			});

			return sectionOffset + 768
		} else {
			read(4);
			addRow("ColorModeData", getNumberValue(), "For all but Indexed and Duotone colors this section is an empty 4 byte field set to 0");
			
			return sectionOffset + 4
		}
}

// Read the series of tagged blocks in the Image Resource Section
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readImageResources(sectionOffset)
{
	setOffset(sectionOffset);

	read(4);
	const ImageResourceLength = getNumberValue();
	const ImageResourceOffset = readOffset();
	let toRead = ImageResourceLength;
	
	addRow("Image Resources");
	addDetails(() => {
		addRow("Image Resources Length", ImageResourceLength, "Length of image resource section. The length may be zero.");
		while(toRead > 0)
		{
			len = readImageResourceBlock();
			toRead -= len;
		}
	});

	setOffset(ImageResourceOffset);
	read(ImageResourceLength);

	return sectionOffset + ImageResourceLength + 4
}

// Read an individual Image Resource block
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readImageResourceBlock()
{
	let resourceBlockLen = 0;

	read(4);
	const Signature = getStringValue();	// Must be 8BIM
	read(2);
	const ImageResourceID = getNumberValue();	// Reference to what each ID does can be found here: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/#50577409_38034
	const [PascalString, PascalLength] = readPascalStr();	// Pascal String with its length padded to 2, this appears to be empty most of the time
	read(4)
	const ImageResourceSize = roundUpToMultiple(getNumberValue(), 2);	// This is also padded to a multiple of 2 like the pascal string
	const ImageResourceMarker = readOffset();
	read(ImageResourceSize);

	resourceBlockLen += 4 + 2 + PascalLength + 4 + ImageResourceSize;

	addRow("Image Resource", ImageResourceID, IMAGE_RESOURCE_ID_NAMES[ImageResourceID]);
	addDetails(() => {
		setOffset(ImageResourceMarker);
		addRow("Signature", Signature, "Must be 8BIM");
		addRow("Unique Identifier", ImageResourceID, IMAGE_RESOURCE_ID_NAMES[ImageResourceID]);
		if (PascalString != null)
		{
			addRow("Pascal String", PascalString);
		}
		addRow("Image Resource Size", ImageResourceSize);
		memdumpMaxAmountDetail(ImageResourceSize, 64, "Image Resource Data", ImageResourceMarker);
	});
	

	return resourceBlockLen;
}

// Read the Layer and Mask Info section which is itself split up into Layer Info, Global Layer Mask Info and Additional Layer Information
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readLayerMaskInfo(sectionOffset)
{
	setOffset(sectionOffset);
	
	addRow('Layer and Mask Info');

	// Layer and Mask Info Section Marker is 8 bytes for PSB and otherwise 4 bytes
	readPsdPsb(4, 8)
	const LayerAndMaskInfoLength = getNumberValue();
	const LayerAndMaskInfoOffset = readOffset()

	addDetails(() => {
		addRow("LayerAndMaskInfoLength", numberWithCommas(LayerAndMaskInfoLength) + " bytes", "Length of the layer and mask information section. (**PSB** length is 8 bytes.)");

		// Layer info length marker is 8 bytes for PSB and otherwise 4 bytes
		readPsdPsb(4, 8);
		const LayerInfoSectionLength = getNumberValue()

		// Parse the Layer Section
		parseLayerMaskInfo(LayerAndMaskInfoOffset, LayerAndMaskInfoLength, LayerInfoSectionLength)
	});

	return LayerAndMaskInfoOffset + LayerAndMaskInfoLength
}

// Parse Layer Mask Info Section. This is separated as 16- and 32-bit files store their Layer Info Section under
// Additional Layer Info
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function parseLayerMaskInfo(sectionOffset, sectionLength, layerLength)
{
	// Code adapted from psd_sdk by MolecularMatters to keep this as a single function for all color depths

	// Read Layer Info Section
	if(layerLength > 0){
		const layerInfoOffset = readOffset();
		
		read(layerLength)
		addRow("Layer Info")
		addDetails(() => {
			setOffset(layerInfoOffset);

			addRow("LayerInfoLength", numberWithCommas(layerLength) + " bytes", "Length of the layers info section, rounded up to a multiple of 2. (**PSB** length is 8 bytes.)");
			read(2);
			const LayerCount = getSignedNumberValue()	// Can be negative which indicates the first alpha channel is the alpha of the merged result
			addRow("LayerCount", LayerCount, "Number of layers in the file");
			
			// Read Layer Records and Channel Image Data
			addRow('Layer Records', 0, "One for each logical layer in the scene");
			let channelImageLengths = []
			let channelImageSize = 0;
			// Read the layer records for all layers and fill the array with channel layer sizes
			for (let i = 0; i < Math.abs(LayerCount); i++)
			{
				const channelLengths = readLayerRecord(i);
				for (let i = 0; i < channelLengths.length; i++)
				{
					channelImageLengths.push(channelLengths[i]);
					channelImageSize += channelLengths[i]
				}	
			}
			readChannelImageData(channelImageLengths, channelImageSize);
		});
	}

	// Parse the Global Layer Mask Info and Additional Layer Info
	if (sectionLength > 0)
	{	
		// Figure out where we are in the file and set the offset
		globalInfoSectionOffset = sectionOffset + layerLength + swapPsdPsb(4, 8);
		setOffset(globalInfoSectionOffset);

		if (sectionOffset + sectionLength > globalInfoSectionOffset)
		{
			let toRead = sectionOffset + sectionLength - globalInfoSectionOffset;
			// Global Layer Mask Info Section
			{
				read(4);
				const GlobalLayerMaskInfoLength = getNumberValue();
				const GlobalLayerMaskInfoOffset = readOffset();
				read(GlobalLayerMaskInfoLength)
				if (GlobalLayerMaskInfoLength != 0)
				{
					addRow("Global Layer Mask Info");
					addDetails(() => {
						setOffset(GlobalLayerMaskInfoOffset);
						addRow("Global Layer Mask Info Length", GlobalLayerMaskInfoLength);
						memdumpMaxAmount(GlobalLayerMaskInfoLength, 64)
					});
				}
				toRead -= GlobalLayerMaskInfoLength + 4;
			}
			
			// If there is still data to read, this is the Additional Layer Info
			addRow("Additional Layer Information")
			const additionalLayerOffset = readOffset();		// Offset of the additional layer info
			read(toRead);
			addDetails(() => {
				setOffset(additionalLayerOffset);
				while (toRead > 0)
				{
					read(4);
					const additionaLayerInfoSignature = getStringValue()
					read(4);
					const additionaLayerInfoKey = getStringValue()
					if (EIGHT_BYTE_KEYS.includes(additionaLayerInfoKey))
					{
						readPsdPsb(4, 8);
						toRead -= 4 * 2 + swapPsdPsb(4, 8);
					} else
					{
						read(4);
						toRead -= 4 * 3
					}
					let additionalLayerLength = getNumberValue()
					const additionaLayerSectionOffset = readOffset()	// Offset of this individual section
					additionalLayerLength = roundUpToMultiple(additionalLayerLength, 4);	// Despite the documentation saying this is 2, in reality its 4	

					addRow("Additional Layer Section", additionaLayerInfoKey, "Length of " + numberWithCommas(additionalLayerLength));
					read(additionalLayerLength);
					addDetails(() => {
						setOffset(additionaLayerSectionOffset);
						addRow("Signature", additionaLayerInfoSignature, "'8BIM' or '8B64'");
						addRow("Key", additionaLayerInfoKey, "Key: a 4-character code (See individual sections)");
						// 16 or 32 bit documents store their layer info section in the additional layer info section
						// under these tags. We pass in a section offset and section length of 0 to force parseLayerMaskInfo
						// to only read layer info
						if (additionaLayerInfoKey == "Lr16")
						{
							parseLayerMaskInfo(0, 0, additionalLayerLength);
						}
						else if (additionaLayerInfoKey == "Lr32")
						{
							parseLayerMaskInfo(0, 0, additionalLayerLength);
						}
						else
						{
							addRow("Length", additionalLayerLength, "Length data below, rounded up to an even byte count.");
							// Skip the length of this and memdump some or all of it
							memdumpMaxAmount(additionalLayerLength, 256);
						}

					});
					toRead -= additionalLayerLength;
				}
			});
		}
	}
}

// Read a singular layer record instance and return an array holding the lengths of all the channels identified
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readLayerRecord(layerIndex){
	let channel_lengths = [];
	let channel_ids = [];
	let coordinates = [];
		
	// Rectangle containing the contents of the layer. Specified as top, left, bottom, right coordinates
	for (let i = 0; i < 4; i++) {
		read(4);
		let coordinate = getNumberValue();
		coordinates.push(coordinate);
	}
	// Number of channels in the layer
	read(2);
	numChannels = getNumberValue()
	
	// Channel information. Six or Ten bytes per channel
	for (let j = 0; j < numChannels; j++) 
	{
		read(2);
		let channel_id = getSignedNumberValue();
		channel_ids.push(channel_id)
		readPsdPsb(4, 8)	// Read length of channel
		let channel_length = getNumberValue();
		channel_lengths.push(channel_length);
	}
	read(4);
	let blendMode = getStringValue();
	read(4);
	let blendModeKey = getStringValue();
	
	read(1);
	let opacity = getNumberValue()
	read(1);
	let clipping = getNumberValue();
	read(1);
	let flags = getBitsValue();
	read(1)	// Filler
	
	read(4);
	const extraDataLen = getNumberValue();
	const extraDataOffset = readOffset();

	// Get the layer name to display it
	skipLayerMaskData();
	skipLayerBlendingRanges();
	const [pascalStr, pascalLen] = readPascalStr(4);

	// Skip the extra data for now
	setOffset(extraDataOffset);
	read(extraDataLen);

	// Add UI elements later as anything in addDetails() gets run deferred
	addDetails(() => {
		addRow("Layer Record '" + pascalStr + "'", layerIndex);
		addDetails(() => {
			addRow("Number of Channels", numChannels);
			addRow("Enclosing Rectangle", "[ " + coordinates[0] + ", " + coordinates[1] + ", " + coordinates[2] + ", " + coordinates[3] + " ]", "Top, Left, Bottom and Right coordinates")

			for (let j = 0; j < numChannels; j++) 
			{
				addRow("Channel ID", channel_ids[j], "0 = red, 1 = green, etc.;-1 = transparency mask; -2 = user supplied layer mask, -3 real user supplied layer mask (when both a user mask and a vector mask are present)");
				addRow("Channel Data Length", channel_lengths[j], "4 bytes for length of corresponding channel data. (**PSB** 8 bytes for length of corresponding channel data.) See See Channel image data for structure of channel data.")
			}

			addRow("BlendModeSignature", blendMode, "Has to be 8BIM")
			addRow("BlendModeKey", blendModeKey);

			addRow("Opacity", opacity, "0 = transparent ... 255 = opaque")
			addRow("Clipping", clipping, "0 = base, 1 = non-base")
			addRow("Flags", flags, "bit 0 = transparency protected; bit 1 = visible; bit 2 = obsolete; bit 3 = 1 for Photoshop 5.0 and later, tells if bit 4 has useful information; bit 4 = pixel data irrelevant to appearance of document")
			addRow("Extra Field Length", extraDataLen, "Length of the extra data field ( = the total length of the next five fields).")
			setOffset(extraDataOffset);
			let layerMaskDataLen = readLayerMaskData();
			let layerBlendingRangesLen = readLayerBlendingRanges(numChannels);
			read(pascalLen);
			if(pascalStr)
			{
				addRow("Layer Name", pascalStr)
			}
			// Figure out what is left to read as this represent the additional layer information
			let toRead = extraDataLen - pascalLen - layerBlendingRangesLen - layerMaskDataLen;
			readAdditionalLayerInformation(toRead, readOffset());
		});
	});

	setOffset(extraDataOffset + extraDataLen);

	return channel_lengths;
}

// Read the Layer Mask Data at the end of a layer record, can be 4, 24 or 40 bytes
// Return the length of the section INCLUDING the length marker
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readLayerMaskData(){
	read(4);
	let dataSize = getNumberValue()
	let dataOffset = readOffset()
	
	const coordinates_str = ["top", "left", "bottom", "right"]
	let coordinates = []
	let defaultColor = 0;
	let flags = 0;
	let realFlags = 0;
	let realUserMaskBackground = 0;
	let realUserMaskCoordinates = [];

	if(dataSize > 0){
		for (let i = 0; i < 4; i++) {
			read(4);
			coordinates.push(getNumberValue())
		}
		read(1);
		defaultColor = getNumberValue();
		//Flags
		read(1);
		flags = getBitsValue();
		if(flags[4] == '1'){
			read(1);
			maskParams = getBitsValue();
			if(maskParams == "7" || maskParams == "5"){
				read(8);
			} else if (maskParams == "6" || maskParams == "4"){
				read(1);
			}
		}
		if(dataSize == 20)
		{
			// Padding bytes
			read(2);
		} else
		{
			// Real Flags
			read(1);
			realFlags = getBitsValue();
			// Real User Mask background
			read(1);
			realUserMaskBackground = getNumberValue();
			// Rectangle enclosing layer mask
			for (let i = 0; i < 4; i++) {
				read(4);
				realUserMaskCoordinates.push(getNumberValue);
			}
		}
		
	}

	addRow("Layer Mask Data")
	addDetails(() => {
		addRow("Size", dataSize, "Size of the data: Check the size and flags to determine what is or is not present. If zero, the following fields are not present")
		if (dataSize > 0)
		{
			addRow("Default Color", defaultColor, "0 or 255");
			addRow("Flags", flags, "Flags. bit 0 = position relative to layer; bit 1 = layer mask disabled; bit 2 = invert layer mask when blending (Obsolete); bit 3 = indicates that the user mask actually came from rendering other data; bit 4 = indicates that the user and/or vector masks have parameters applied to them");
			
			if(flags[4] == '1'){
				addRow("Mask Parameters", maskParams, "Mask Parameters. Only present if bit 4 of Flags set above.")
			}

			for (let i = 0; i < 4; i++)
			{
				addRow("Rectangle enclosing layer " + coordinates_str[i], coordinates[i]);
			}

			if (dataSize > 20)
			{
				addRow("Real Flags", realFlags, "Same as Flags field above");
				addRow("Real User Mask Background", realUserMaskBackground, "0 or 255");
				for (let i = 0; i < 4; i++)
				{
					addRow("Rectangle enclosing layer " + coordinates_str[i], realUserMaskCoordinates[i]);
				}
			}
		}
	});
	return dataSize + 4;
}

function skipLayerMaskData()
{
	read(4);
	read(getNumberValue());
}

// Read the Layer Blending Ranges data found at the end of the layer record area
// Return the length of the section INCLUDING the length marker
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readLayerBlendingRanges(NumChannels){
	//Length of layer blending ranges data
	read(4);
	const dataLen = getNumberValue();
	let toRead = getNumberValue();
	const dataOffset = readOffset();
	//Composite gray blend source. Contains 2 black values followed by 2 white values. Present but irrelevant for Lab & Grayscale
	read(1);
	const compositeGreySourceBlack0 = getNumberValue();
	read(1);
	const compositeGreySourceBlack1 = getNumberValue();
	read(1);
	const compositeGreySourceWhite0 = getNumberValue();
	read(1);
	const compositeGreySourceWhite1 = getNumberValue();
	//Composite gray blend destination range
	read(1);
	const compositeGreyDestinationBlack0 = getNumberValue();
	read(1);
	const compositeGreyDestinationBlack1 = getNumberValue();
	read(1);
	const compositeGreyDestinationWhite0 = getNumberValue();
	read(1);
	const compositeGreyDestinationWhite1 = getNumberValue();
	
	toRead -= 8;

	let channelSource = []
	let channelDestination = []


	for (let i = 0; i < NumChannels; i++){
		// The documentation is a bit unclear about which channels to consider here so we keep reading until there is nothing left to read
		if (toRead > 8)
		{
			// Source Range; First the two black values and then the two white values
			read(1);
			channelSource.push(getNumberValue());
			read(1);
			channelSource.push(getNumberValue());
			read(1);
			channelSource.push(getNumberValue());
			read(1);
			channelSource.push(getNumberValue());
			// Destination Range; First the two black values and then the two white values
			read(1);
			channelDestination.push(getNumberValue());
			read(1);
			channelDestination.push(getNumberValue());
			read(1);
			channelDestination.push(getNumberValue());
			read(1);
			channelDestination.push(getNumberValue());
			toRead -= 8;
		}
	}
	if(toRead > 0)
	{
		read(toRead);	// Read potential padding bytes
	}

	addRow("Layer Blending Ranges")
	addDetails(() => {
		addRow("Length", dataLen);

		// There is 2 values here as the slider can be split by holding down shift
		addRow("Composite Gray blend source black", compositeGreySourceBlack0 + "/" + compositeGreySourceBlack1);
		addRow("Composite Gray blend source white", compositeGreySourceWhite0 + "/" + compositeGreySourceWhite1);
		addRow("Composite Gray blend destination black", compositeGreyDestinationBlack0 + "/" + compositeGreyDestinationBlack1);
		addRow("Composite Gray blend destination white", compositeGreyDestinationWhite0 + "/" + compositeGreyDestinationWhite1);

		for (let i = 0; i < Math.floor(channelDestination.length / 4); i++){
			addRow("Channel " + i)
			addDetails(() => {
				addRow("source range black", channelSource[i*4 + 0] + "/" + channelSource[i*4 + 1]);
				addRow("source range white", channelSource[i*4 + 2] + "/" + channelSource[i*4 + 3]);

				addRow("destination range black", channelDestination[i*4 + 0] + "/" + channelDestination[i*4 + 1]);
				addRow("destination range white", channelDestination[i*4 + 2] + "/" + channelDestination[i*4 + 3]);
			})
		}
	});
	return dataLen + 4;
}

function skipLayerBlendingRanges()
{
	read(4);
	read(getNumberValue());
}

// Read an entire Channel Image Data section based on the Array of Channel lengths and total length provided
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readChannelImageData(channelImageLengths, channelImageSize)
{
	addRow("Channel Image Data");
	// Skip forward as addDetails only gets evaluated upon opening
	const channelImageOffset = readOffset();
	setOffset(channelImageOffset + channelImageSize + 2)

	addDetails(() => {
		// Set the offset back to allow
		setOffset(channelImageOffset)
		addRow("Channel Amount", channelImageLengths.length)
		// Display the channel image data Section
		for (const channel of channelImageLengths)
		{
			read(2);
			addRow("Compression Method", getNumberValue());
			addRow("Length of Channel", channel, "Includes Compression Method Marker (+2)")

			const offset = readOffset();
			memdumpMaxAmountDetail(channel - 2, 128, "Channel Memory Dump", offset)
		}
	});
}

// Read a section of additional layer information found both at the end of each layer record. As the size is never 
// explicitly defined we keep reading until either the max length is reached or we do not encounter a tagged block with 
// signature 8BIM/8B64.
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readAdditionalLayerInformation(maxLen, memOffset)
{
	if (maxLen == 0)
	{
		return;
	}
	let toRead = maxLen;
	
	read(maxLen);
	addRow("Additional Layer Information")
	addDetails(() => {
		setOffset(memOffset);
		// Iterate all the tagged blocks
		while(toRead > 0)
		{
			read(4);
			const additionaLayerInfoSignature = getStringValue()
			if(additionaLayerInfoSignature != "8BIM" && additionaLayerInfoSignature != "8B64")
			{
				addRow("Failed Signature Check", additionaLayerInfoSignature)
				setOffset(readOffset() - 4);
				break;
			}
			read(4);
			const additionaLayerInfoKey = getStringValue()
			if (EIGHT_BYTE_KEYS.includes(additionaLayerInfoKey))
			{
				readPsdPsb(4, 8);
				toRead -= 4 * 2 + swapPsdPsb(4, 8);
			} else
			{
				read(4);
				toRead -= 4 * 3
			}
			let additionalLayerLength = getNumberValue()
			const additionaLayerSectionOffset = readOffset()	// Offset of this individual section
			additionalLayerLength = roundUpToMultiple(additionalLayerLength, 2);

			read(additionalLayerLength);
			
			addRow("Additional Layer Section", additionaLayerInfoKey)
			addDetails(() => {
				setOffset(additionaLayerSectionOffset);
				addRow("Signature", additionaLayerInfoSignature);
				addRow("Key", additionaLayerInfoKey);
				memdumpMaxAmountDetail(additionalLayerLength, 64, "Data", additionaLayerSectionOffset)
			});

			toRead -= additionalLayerLength;
		}
		// Might be filler bytes?
		if(toRead > 0)
		{
			addRow("Read " + toRead + " Padding Bytes");
			read(toRead);
		}
	});
}

// Read the Image data located at the end of the document
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readImageData(sectionOffset, ChannelCount, Height, Width, Depth)
{
	setOffset(sectionOffset);	// Move the marker manually to the start of the section

	addRow("Image Data Section", 0, "If saving the file with 'Maximize Compatibility' on, this is the merged image data")
	addDetails(() => {
		
	read(2);
	const CompressionMethod = getNumberValue()
	addRow("Compression Method", CompressionMethod,"0 = Raw image data ; 1 = RLE compressed the image data starts with the byte counts for all the scan lines (rows * channels), with each count stored as a two-byte value. The RLE compressed data follows, with each scan line compressed separately. The RLE compression is the same compression algorithm used by the Macintosh ROM routine PackBits , and the TIFF standard.; 2 = ZIP without prediction ; 3 = ZIP with prediction.")

	let channelSize = [];
	for (i = 0; i < ChannelCount; i++)
	{
		channelSize.push(0);
	}
	
	addRow("Image Data")
	// Read RAW Image Data
	if (CompressionMethod == 0)
	{
		// Read the actual pixel values
		for(let i = 0; i < ChannelCount; i++)
		{
			addRow("Channel", i)
			addDetails(() => {
				memdumpMaxAmount(Height * Width * (Depth / 8), 512);
			});
		}
	}
	// Read RLE Encoded Image Data
	if (CompressionMethod == 1)
	{
		// For each of the channels there is a 2/4 byte field of the size of the following scanline
		for(let i = 0; i < ChannelCount; i++)
		{
			for(let j = 0; j < Height; j++)
			{
				readPsdPsb(2, 4)
				channelSize[i] += getNumberValue();
			}
		}

		// Read the actual pixel values
		for(let i = 0; i < ChannelCount; i++)
		{
			addRow("Channel", i)
			addDetails(() => {
				memdumpMaxAmount(channelSize[i], 512)
			});
		}
	}
	});
}


// Read a pascal string and return an array with the string as first item and length as second item. If the string is empty the first item is null
// The string is padded to a size of 2
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function readPascalStr(padding = 2){
	let len = 0;
	read(1);
	// This represents the length of the whole string including the 1 byte length field
	let PascalLength = getNumberValue();
	PascalLength = roundUpToMultiple(PascalLength + 1, padding);

	if (PascalLength > 0 ){
		read(PascalLength - 1);
		len += PascalLength;
		return [getStringValue(), len];
	} else if (PascalLength == 0){
		read(PascalLength - 1);
		len += PascalLength - 1;
		return [null, len];
	}
}

function uniqueIdentifier(Ident, length) {
    
	//ResolutionInfo
	if (Ident == 1005){

	}

    // IPTC record
    else if (Ident == 1028){

    }

}