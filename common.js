
function to_screen(v)
{
    return (0.5 + CSeqViewer.scale(v)) | 0;
}


var CSeqViewer = {
    glyphs : [],
    seq_len : 46709983,
    curr_range : [22000000, 23000000],
    node_counter : 0, 
    glyph_counter : 0,
    Instance : {},
    fetchStart: {},
    fetchImageStart: {},
    init : function(width, height, options) {
        this.options = options;
        this.seq_len = this.options.seq_len;
        this.Instance = new Module.CData(this.options.data); /// Constructor will read the file into the memory
        this.total_range = [0, this.seq_len];
        this.width = width;
        this.height = height;

        this.overview_scale = d3.scaleLinear()
            .domain([0, this.seq_len])
            .range([0, this.width]);

        this.overview_axis = d3.axisTop(this.overview_scale)
            .ticks(20, "<s")
            .tickSizeInner(5)
            .tickSizeOuter(20);

        this.total_scale = d3.scaleLinear()
            .domain(this.total_range)
            .range([0, this.width]);

        this.scale = d3.scaleLinear()
            .domain(this.total_range)
            .range([0, this.width]);

        this.xAxis = d3.axisTop(this.scale)
            .ticks(20, "<s")
            .tickSizeInner(5)
            .tickSizeOuter(20);

        this.overview = svg.append("g").attr("transform", "translate(0,20)");
        this.overview.append("g").attr("transform", "translate(0,20)").call(this.overview_axis);

        this.feat_panel = svg.append("g")
            .attr("class", "feat_panel")
            .attr("transform", "translate(0, 0)")
            .append('g').attr("class", "axis axis--x").call(this.xAxis);

        this.track = this.feat_panel.append("g").attr("class", "tracks");
        this.image = this.feat_panel.append("g").attr("class", "images");
        
        this.zoom = d3.zoom()
            .extent([[0, 0], [width, height]])
            .scaleExtent([1, this.seq_len/8])
            .translateExtent([[0, 0], [this.seq_len, this.height]])
        .on("zoom", this.zoomed);
    
        this.feat_panel.append("rect")
            .attr("class", "zoom")
            .attr("width", this.width)
            .attr("height", this.height)
            .call(this.zoom);

        this.brush = d3.brushX()
            .extent([[0, 0], [this.width, 20]])
            .on("brush end", this.brushed);
    
        d3.json("https://www.ncbi.nlm.nih.gov/projects/sviewer/seqgraphic.cgi?theme=NCBI+Overview&id=" + options.id + "&width=" + this.width + "&assm_context=" + this.options.assembly, 
        (error, data) => {
            this.overview.append('g').attr("transform", "translate(0,20)")
                .append("image")
                .attr("xlink:href","https://www.ncbi.nlm.nih.gov/projects/sviewer/ncfetch.cgi" + data.img_url)
                .attr('width', data.w)
                .attr('height', data.h);
            svg.select(".feat_panel")
                .attr("transform", "translate(0, " + (data.h + 40) + ")");
                this.brush.extent([[0,0], [this.width, data.h]]);

            var s = [this.overview_scale(this.curr_range[0]), this.overview_scale(this.curr_range[1])];
            this.overview.append("g")
                .attr("class", "brush")
                .call(this.brush)
                .call(this.brush.move, s);// overview_scale.range());
        });
    },    
    zoomed : ()=> {
        
        if (d3.event.sourceEvent && d3.event.sourceEvent.type === "brush") 
            return; // ignore zoom-by-brush

        var t = d3.event.transform;
        CSeqViewer.scale.domain(t.rescaleX(CSeqViewer.total_scale).domain());    
    
        if (d3.event.type === "end" || (d3.event.sourceEvent && d3.event.sourceEvent.type === "end")) {
            var domain = CSeqViewer.scale.domain();
            CSeqViewer.fetch_image(domain[0], domain[1]);
            CSeqViewer.fetch_data(domain[0], domain[1]);
            //d3.select('.tracks').attr('filter', "url(#f1)");
        } 
        update_layout(CSeqViewer.glyphs)
        render(CSeqViewer);

        CSeqViewer.xAxis.scale(CSeqViewer.scale);
        CSeqViewer.feat_panel.select(".axis--x").call(CSeqViewer.xAxis);
        CSeqViewer.overview.select(".brush").call(CSeqViewer.brush.move, CSeqViewer.total_scale.range().map(t.invertX, t));
    },
    brushed : function() {

        if (d3.event.sourceEvent && d3.event.sourceEvent.type === "zoom") 
            return; // ignore brush-by-zoom
        var s = d3.event.selection || CSeqViewer.scale.range();
        CSeqViewer.overview_scale.domain(s.map(CSeqViewer.scale.invert, CSeqViewer.scale));
        CSeqViewer.feat_panel.select(".axis--x").call(CSeqViewer.xAxis);
        CSeqViewer.feat_panel.select(".zoom").call(CSeqViewer.zoom.transform, d3.zoomIdentity
            .scale(CSeqViewer.width / (s[1] - s[0]))
            .translate(-s[0], 0));
    },
    
    fetch_image: function(from, to) {
        this.fetchImageStart = performance.now();

        from = Math.round(from);
        to = Math.round(to);
        var len = (to - from) + 1;
        // var url = "https://dev.ncbi.nlm.nih.gov/staff/shkeda/sviewe2/seqgraphic.cgi?";
        //  var params = ["id=NC_000021", "width=" + CSeqViewer.width, "view_width=" + CSeqViewer.width, "from=" + from, "len=" + (to-from)+1, 
        //  "assm_context=GCF_000001405.36", "tracks=[key:gene_model_track,name:Genes,display_name:Genes,id:STD12,category:Genes,annots:Unnamed,Options:ShowAll,SNPs:false,CDSProductFeats:false,NtRuler:true,AaRuler:true,HighlightMode:2]"];
        //    var params = ["id=NC_000021", "width=" + width, "view_width=" + width, "from=" + from, "len=" + (to-from)+1, 
        //        "assm_context=GCF_000001405.37",       "tracks=[key:graph_track,display_name:RNA-seq+exon+coverage,category:Expression,subcategory:RNA-Seq,dbname:SADB,annots:NA000077947.1,style:histogram,scale:log2,sdthresh:5,fixed_scale:false,clip:false,stored_scale:linear,shown:true]"];
        var url = "https://www.ncbi.nlm.nih.gov/projects/sviewer/seqgraphic_rmt.cgi?";
        var params = ["id=" + this.options.id, 
        "width=" + width, 
        "view_width=" + width, 
        "from=" + from, 
        "len=" + len,         
        "appname=ncbi_sviewer",
        "assm_context=" + this.options.assembly, 
        this.options.affinity,
        this.options.tracks];
        //"tracks=%5Bkey%3Agraph_track%2Cname%3AbpHistoneModsERX197190C0010KH1H3K4me1MACS2_wigglerEMBL-EBIwiggler%2Cdisplay_name%3A(H)%20C0010K%20H3K4me1%20MACS2_wiggler%20CD14-positive%5C%2C%20CD16-negative%20classical%20monocyte%20signal%20from%20NCMLS%2Cid%3ARB2HgQAAA9C74%2Cdbname%3AbigWig%2Csetting_group%3ABlueprint%2Cannots%3Ahttp%5C%3A%2F%2Fftp.ebi.ac.uk%2Fpub%2Fdatabases%2Fblueprint%2Fdata%2Fhomo_sapiens%2FGRCh38%2Fvenous_blood%2FC0010K%2FCD14-positive_CD16-negative_classical_monocyte%2FChIP-Seq%2FNCMLS%2FC0010KH1.ERX197190.H3K4me1.bwa.GRCh38.20150529.bw%2Cstyle%3Ahistogram%2Cscale%3Alinear%2Csmooth_curve%3Afalse%2Ccolor%3A255%20188%2058%2Copacity%3A100%2Crmt_mapped_id%3Achr21%5D"];
        //tracks=[key:graph_track,name:bpHistoneModsERX197190C0010KH1H3K4me1MACS2_wigglerEMBL-EBIwiggler,display_name:track,id:RB2HgQAAA9C74,dbname:bigWig,setting_group:Blueprint,annots:http\://ftp.ebi.ac.uk/pub/databases/blueprint/data/homo_sapiens/GRCh38/venous_blood/C0010K/CD14-positive_CD16-negative_classical_monocyte/ChIP-Seq/NCMLS/C0010KH1.ERX197190.H3K4me1.bwa.GRCh38.20150529.bw,style:histogram,scale:linear,smooth_curve:false,color:255+188+58,opacity:100,rmt_mapped_id:chr21]"];
        var s = url + params.join("&");
        d3.json(s, (error, data) => {
            render_image(data);
        });
        /*
        d3.json(s, function(error, objs) {
            if (objs.glyphs && objs.glyphs && objs.glyphs.SV_Glyph_List) {
                CSeqViewer.curr_range = [from, to];
                CSeqViewer.glyphs = prepare_data(objs.glyphs.SV_Glyph_List.g);
                update_layout(CSeqViewer.glyphs);
                render(CSeqViewer.glyphs);
            }
        });
        */
    },

    fetch_data : function(from, to) {
        this.fetchStart = performance.now();
        this.from = Math.round(from);
        this.to = Math.round(to);
        var len = (this.to - this.from) + 1;
        var y_vec = new Module.VectorFloat();
        console.time("get_data");
        this.Instance.GetData(this.from, this.to, width, y_vec);
        var graph = {};
        graph.p = [];
        graph.min = Number.MAX_VALUE;
        graph.max = -graph.min;
        for (var i = 0; i < y_vec.size(); ++i) {
            var y = y_vec.get(i);
            if (y < graph.min) graph.min = y;
            if (y > graph.max) graph.max = y;    
            graph.p.push({x: i, y: y});
        }
        console.timeEnd("get_data");
        y_vec.delete();
        var glyphs = [{data:{graph}, p: {l: [{x: this.from, l: len}]}, t:"graph", i:"graph"}];
        this.glyphs = prepare_data(glyphs);
        update_layout(this.glyphs);
        render(this);
    }
};





function update_layout(glyphs)
{
    if (!glyphs || glyphs.length == 0)
        return;
    // sort by widths
    glyphs.sort(function(a, b) {
       return b.w-a.w;
    });
    var layout = [];
    function calc_layout(g, index, start, stop) {
        var col_added = false;
        var top = 20;
        for (var r = index; r < layout.length; ++r) {
            var cols = layout[r].cols;
            var intersect = false;
            for (var i = 0; i < cols.length; ++i) {
                if (stop < cols[i].start || start > cols[i].stop)
                    continue;
                intersect = true;
                break;
            }
            if (!intersect) {
                g.y = top + r * 24;
                layout[r].cols.push({start:start - 2,stop:stop + 2});
                if (g.expanded) {
                    //g.g.g.forEach(function(g) { calc_layout(g, r + 1 + +i, start, stop);});
                    
                    for (var i in g.g.g) {
                        var index = r + 1 + +i;
                        if (index < layout.length) {
                            layout[index].cols.push({start:start - 2,stop:stop + 2});
                        } else {
                            layout.push({cols:[{start:start - 2,stop:stop + 2}]});
                        }
                    }
                    
                }
                col_added = true;
                break;
            }
        }        
        if (!col_added) {
            g.y = top + layout.length * 24;
            layout.push({cols:[{start:start - 2,stop:stop + 2}]});
            if (g.expanded) {
                g.g.g.forEach(function(g) {
                    layout.push({cols:[{start:start - 2,stop:stop + 2}]});
                });
            }
        }
    }
    
    glyphs.forEach(function (g) { calc_layout(g, 0, to_screen(g.start), to_screen(g.stop));} );
}
function makeid()
{
    var text = "";
    var  possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}


function prepare_data(gl)
{
    node_counter = 0;
    gl.forEach(function(gl) {
        var w = 0;
        for (var i in gl.p.l) {
            var loc = gl.p.l[i];
            w += loc.l;
        }
        gl.w = w;
        if (gl.p.s && gl.p.s == 2) {
            gl.stop = gl.p.l[0].x + gl.p.l[0].l;
            gl.start = gl.p.l[gl.p.l.length - 1].x;
        } else {
            gl.start = gl.p.l[0].x;
            gl.stop = gl.p.l[gl.p.l.length - 1].x + gl.p.l[gl.p.l.length - 1].l;
        }
        
        gl.expanded = gl.g ? true : false;
        var h = gl.t == "graph" ? 30 : 11;
        gl.h = h;
        gl.th = h;
        ++node_counter;
        if (gl.g) {
            gl.g.g.forEach(function(g) {
                gl.th += 24;
                var w = 0;
                for (var i in g.p.l) {
                    var loc = g.p.l[i];
                    w += loc.l;
                }
                g.w = w;
                g.h = 11;
                g.th = 1;
                if (g.p.s && g.p.s == 2) {
                    g.stop = g.p.l[0].x +  + g.p.l[0].l;
                    g.start = g.p.l[g.p.l.length - 1].x;
                } else {
                    g.start = g.p.l[0].x;
                    g.stop = g.p.l[g.p.l.length - 1].x + g.p.l[g.p.l.length - 1].l;
                }
                ++node_counter;
            });
        }
    });
    return gl;
}

function get_visible(glyphs)    
{    
    var y_top = this.scrollY;
    var y_bottom = y_top + this.innerHeight;
    var width = this.innerWidth;
    var visible = [];
    glyphs.forEach(function(g) {
        var x1 = to_screen(g.start);
        var x2 = to_screen(g.stop);
        var y1 = g.y;
        var y2 = g.y + g.th;
        if (!((x1 > width) || (x2 <= 0))) {

//        if ((x1 >= 0 && x1 < width) || (x2 >= 0 && x2 < width)) {

            if ((y1 >= y_top && y1 < y_bottom) || (y2 > y_top && y2 <= y_bottom)) {
                visible.push(g);
            } 
        } 
    });
    return visible;
}