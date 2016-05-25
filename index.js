var Promise = require("bluebird");

// problem defines:
// * Model() - create a blank model
// * estimateModel(sample) - sample is a list of points
// * sampleError(point) - model error for a single point
// * k - points in a sample
// optionally defines:
// * refineModel(inliers, model) -- to come up with a good version of the model
// * adjustScore(score, model) -- for fidling
// * generateSamples*() -- deterministically yields all of the possible k point samples

module.exports = function(problem, points, thresh, pval, outliers, concurrency) {
    function nCr(n,k) {
        var max = Math.max(k, n - k);
        var result = 1;
        for (var i = 1; i <= n - max; i++) {
            result = result * (max + i) / i;
        }
        return result;
    }
    
    function * generateSample(points, k, pval, outliers) {
        if(points.length == 0) throw "Can't model without points";
        var n = points.length;
        var sample = [];
        var point;
        var samples = new Set();
        itrs = Math.ceil(Math.log(1-pval) / Math.log(1-Math.pow(1-outliers, k))) + n;
        // needs deterministic samples, provided by the problem
        if(itrs > (nCr(n,k) - 10) && problem.generateSamples) {
            yield* problem.generateSamples(n);
        // needs random samples
        } else {
            // get through all the samples we need
            while(samples.size < itrs) {
                // generate the sample
                while(sample.length < k) {
                    point = Math.floor(Math.random()*n);
                    if(sample.indexof(point) == -1){
                        sample.push(point);
                    }
                }
                // check that we haven't seen it yet
                sample.sort(function(a,b){return a - b});
                if(!samples.has(sample.toString())){
                    samples.add(sample.toString());
                    yield sample;
                }
            }
        }  
    }
    
    // run RANSAC
    return Promise.map(generateSample(points, problem.k, pval, outliers), function(sample){
       
        var solution = {
            model: new problem.estimateModel(sample.map(function(a){return points[a]})),
            score: 0,
            inliers: []    
        };
        var err;
        for(point of points) {
            err = problem.sampleError(point, solution.model) / points.length;
            if(err < thresh) {
                solution.inliers.push(point);
                solution.score += err;
            } else {
                solution.score += thresh;
            }
        }
        
        if(problem.adjustScore){
            solution.score = problem.adjustScore(solution.score, solution.model);
        }
        return solution;
        
    }, {concurrency: concurrency})
    .reduce(function(a,b){return a.score < b.score ? a : b;})
    .then(function(solution){
        if(problem.refine) {
            solution.model = problem.refine(solution.inliers, solution.model);
        }
        return solution;
    })
    .catch(function(error){
        return {
            model: new problem.Model(),
            inliers: [],
            score: 1/0,
            error: error
        }
    })
}